import json
import numpy as np
import pandas as pd
from utils import read_file_content, call_openai_annotation, parse_json_output, call_openai, parse_aggregation, parse_merge, get_embeddings_with_cache
from typing import List, Dict
from fastapi import UploadFile
import logging
from sklearn.cluster import KMeans
from k_means_constrained import KMeansConstrained
from sklearn.decomposition import PCA
import os
import datetime
import pickle
from openai import OpenAI
from collections import OrderedDict
import uuid

client = OpenAI()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("services")  # Create/retrieve a named logger
logger.setLevel(logging.INFO)


AGGREGATION_RPOMPT = """I am annotating the following task:

<annotation_guideline>
{guideline}
</annotation_guideline>

While annotating, I encountered these edge cases that are not clearly addressed in the guideline:
<edge_cases>
{edge_case}
</edge_cases>
Each edge case is numbered with <Edge Case Numbers> (e.g., 1, 2, 3, ...), and follows the format:
"when <condition> -> <action>",
where <condition> describes the edge case and <action> states how to handle it.

Your task:
Create a set of high-level categories that cover all the edge cases above.

Requirements:
1. Every edge case must be assigned to a category—no exceptions.
2. The categories should summarize the edge cases in a high-level, avoid too many categories.
3. Iteratively refine your category list: If a category overgeneralizes, split it. If two categories overlap significantly, merge them.
4. In your response, category descriptions MUST be in the format of "when <summarized condition> -> <generalized action>", starting with "when" and with condition and action connected by "->".

Please reply in the following JSON format:
```json
{{
  "categories": [
    {{
      "category_description": "when <summarized condition> -> <generalized action>",
      "edge_cases": [<Edge Case Numbers, e.g., 1, 5, 6>]
    }},
    {{
      "category_description": "when <summarized condition> -> <generalized action>",
      "edge_cases": [<Edge Case Numbers>]
    }}
    // ... more categories as needed
  ]
}}
```
"""

MERGE_PROMPT = """I am annotating the following task:

<annotation_guideline>
{guideline}
</annotation_guideline>

While annotating, I encountered these edge cases that are not clearly addressed in the guideline:
<edge_cases>
{edge_case}
</edge_cases>
Each edge case is numbered with <Edge Case Numbers> (e.g., 1, 2, 3, ...), and follows the format:
"when <condition> -> <action>",
where <condition> describes the edge case and <action> states how to handle it.

Your task:
If there are edge cases that describe VERY similar situations, merge them by grouping the relevant edge case numbers together.

Requirement:
1. Only merge very similar cases.
2. Iteratively refine your category list: If a category overgeneralizes, split it.


Please respond in the following format:
<format>
Merge Suggestions:
Merge [list 1 of edge case numbers]: when <merged condition> -> <merged action>
Merge [list 2 of edge case numbers]: when <merged condition> -> <merged action>
...
</format>

If there is no merge suggestion, write NO MERGE after "Merge Suggestions:"."""


# Clustering
def cluster_texts_with_pca(df, text_column='text_to_annotate', n_clusters=4):
    logger = logging.getLogger("services")

    # Encode text into embeddings
    embeddings = get_embeddings_with_cache(df[text_column].tolist(), "text-embedding-3-large", client)

    # Cluster in embedding space
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    labels = kmeans.fit_predict(embeddings)
    df["cluster"] = labels

    # Reduce to 2D with PCA
    pca = PCA(n_components=2, random_state=42)
    reduced = pca.fit_transform(embeddings)
    df["pca_x"] = reduced[:, 0]
    df["pca_y"] = reduced[:, 1]

    logger.info(f"Assigned {n_clusters} clusters and PCA values to {len(df)} samples.")

    return df


async def synthesize_guideline_improvements(df, guideline_text, task_id: str = None):
    # Filter non-empty suggestions
    df = df[df["guideline_improvement"].str.strip().str.upper() != "EMPTY"].copy()
    if df.empty:
        return {}, []
    # Get text and embeddings
    suggestions = df["guideline_improvement"].tolist()
    case_descriptions = [s.split('\n')[0] for s in suggestions]
    embeddings = get_embeddings_with_cache(case_descriptions, "text-embedding-3-large", client)
    
    # Determine appropriate number of clusters based on data size
    data_size = len(suggestions)
    logger.info(f"Found {data_size} non-empty improvement suggestions")
    
    # Dynamically adjust n_clusters if there's not enough data
    actual_n_clusters = data_size // 15 + 1
    logger.info(f"On average, we want each cluster to have roughly 15 samples, so cluster number set to {actual_n_clusters}")

    # Skip clustering if too few data points
    if data_size <= 1:
        # For single or no suggestions, don't cluster
        cluster_summaries = {}
        if data_size == 1:
            cluster_summaries["edge_case_0"] = suggestions[0]
            df["cluster_id"] = 0
            df["pca_x"] = [0.0]
            df["pca_y"] = [0.0]

            # Create a copy of the dataframe for improvement clusters
            improvement_df = df.copy()
            # Rename cluster_id to cluster for consistency
            improvement_df['edge_case_id'] = improvement_df['cluster_id']

            # Select only the fields we need, ensuring consistent structure with annotations
            fields_to_include = ["text_to_annotate", "uid", "edge_case_id", "pca_x", "pca_y",
                                "raw_annotations", "analyses", "annotation", "confidence",
                                "guideline_improvement"]

            # Only include fields that exist in the DataFrame
            valid_fields = [f for f in fields_to_include if f in improvement_df.columns]
            improvement_clusters = improvement_df[valid_fields].to_dict(orient="records")

        return cluster_summaries, improvement_clusters if data_size == 1 else []

    # Try to load existing models if task_id is provided
    pca = None
    sc_kmeans = None
    if task_id:
        try:
            with open(f'models/pca_model_{task_id}_cluster.pkl', 'rb') as f:
                pca = pickle.load(f)
            with open(f'models/kmeans_model_{task_id}_cluster.pkl', 'rb') as f:
                sc_kmeans = pickle.load(f)
            logger.info(f"Loaded existing models for task {task_id}")
        except FileNotFoundError:
            logger.info(f"No existing models found for task {task_id}, will create new ones")

    # If models don't exist or couldn't be loaded, create new ones
    if pca is None or sc_kmeans is None:
        # Cluster with Size Constrained KMeans
        if data_size <= 20:
            size_min, size_max = None, None
        elif 20 < data_size <= 40:
            size_min, size_max = 5, 20
        else:
            size_min, size_max = 10, 20
        sc_kmeans = KMeansConstrained(n_clusters=actual_n_clusters, size_min=size_min, size_max=size_max, random_state=42)
        labels = sc_kmeans.fit_predict(embeddings)
        df["cluster_id"] = labels

        # PCA reduction 
        pca = PCA(n_components=2, random_state=42)
        reduced = pca.fit_transform(embeddings)
        df["pca_x"] = reduced[:, 0]
        df["pca_y"] = reduced[:, 1]

        # Save models if task_id is provided
        if task_id:
            os.makedirs('models', exist_ok=True)
            with open(f'models/pca_model_{task_id}_cluster.pkl', 'wb') as f:
                pickle.dump(pca, f)
            with open(f'models/kmeans_model_{task_id}_cluster.pkl', 'wb') as f:
                pickle.dump(sc_kmeans, f)
    else:
        # Use existing models for prediction
        reduced = pca.transform(embeddings)
        df["pca_x"] = reduced[:, 0]
        df["pca_y"] = reduced[:, 1]
        labels = sc_kmeans.predict(np.array(embeddings))
        df["cluster_id"] = labels

    new_rules = OrderedDict()

    all_messages = []
    for cluster_id in range(actual_n_clusters):
        cluster_df = df[df["cluster_id"] == cluster_id]
        suggestions_text = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(cluster_df["guideline_improvement"]))

        # Compose prompt
        all_messages.append([{'role': 'user', 'content': AGGREGATION_RPOMPT.format(guideline=guideline_text, edge_case=suggestions_text)}])

    logger.info(f"One example aggregation prompt: {all_messages[0]}")
    # Send to DeepSeek-R1
    summaries = await call_openai(all_messages, model='deepseek-reasoner')
    for cluster_id, response in enumerate(summaries):
        current_cluster_results = parse_aggregation(response)
        for category in current_cluster_results:
            rule = category['category_description']
            ids = category['edge_cases']
            if ids is None:
                continue
            uids = [df[df["cluster_id"] == cluster_id].iloc[i-1]['uid'] for i in ids if i <= len(df[df["cluster_id"] == cluster_id])]
            if rule in new_rules.keys():
                new_rules[rule].extend(uids)
            else:
                new_rules[rule] = uids

    if actual_n_clusters == 1:
        merged_rules = new_rules
    else:
        logger.info(f'Number of new rule before merge: {len(new_rules)}.')
        cases_to_merge = "\n".join(f"{i+1}. {k}" for i, (k, v) in enumerate(new_rules.items()))
        merge_message = [{'role': 'user', 'content': MERGE_PROMPT.format(guideline=guideline_text, edge_case=cases_to_merge)}]
        final_aggregate = await call_openai([merge_message], model='deepseek-reasoner')
        merge_suggestions = parse_merge(final_aggregate[0])

        merged_rules = OrderedDict()
        all_merged_uids = set()
        for i, (k, v) in enumerate(new_rules.items()):
            key = k
            for s in merge_suggestions:
                if i + 1 in s['merge']:
                    key = s['merged_rule']
                    break
            if key in merged_rules.keys():
                merged_rules[key].extend(v)
            else:
                merged_rules[key] = v
            all_merged_uids.update(v)

    cluster_summaries = {}
    for i, (k, v) in enumerate(merged_rules.items()):
        for uid in v:
            df.loc[df['uid'] == uid, 'edge_case_id'] = i
            df.loc[df['uid'] == uid, 'new_guideline_improvement'] = k
        cluster_summaries[f'edge_case_{i}'] = k

    # Create a copy of the dataframe for improvement clusters
    improvement_df = df.copy()
    # Rename cluster_id to cluster for consistency with annotations
    # improvement_df.rename(columns={"edge_case_id": "cluster"}, inplace=True)
    improvement_df.rename(columns={"guideline_improvement": "low_level_guideline_improvement"}, inplace=True)
    improvement_df.rename(columns={"new_guideline_improvement": "guideline_improvement"}, inplace=True)
    
    # Select only the fields we need, ensuring consistent structure with annotations
    fields_to_include = ["text_to_annotate", "uid", "edge_case_id", "pca_x", "pca_y",
                         "raw_annotations", "analyses", "annotation", "confidence", 
                         "guideline_improvement"]
    
    # Only include fields that exist in the DataFrame
    valid_fields = [f for f in fields_to_include if f in improvement_df.columns]
    if task_id:
        improvement_df[valid_fields].to_csv(f'clustered_results_{task_id}.csv', encoding='utf-8', index=False)
    improvement_clusters = improvement_df[valid_fields].to_dict(orient="records")

    return {
        "suggestions": cluster_summaries,
        "improvement_clusters": improvement_clusters,
    }


### Updated
async def process_annotation_json(
    examples: List[str],
    guideline_text: str,     # used to call OpenAI for annotation
    annotation_guideline: str,          # New parameter: passed into synthesize_guideline_improvements
    uids: List[str] | None,
    task_id: str,  # Added task_id parameter
) -> Dict:
    
    # Wrap examples into DataFrame
    df = pd.DataFrame({"text_to_annotate": examples})

    if "text_to_annotate" not in df.columns:
        raise ValueError("Data must contain 'text_to_annotate' column.")

    ### New: UUIDs
    if uids:
        df["uid"] = uids
    else:
        df["uid"] = [str(uuid.uuid4()) for _ in range(len(df))]

    # Cluster text embeddings (labels and PCA)
    df = cluster_texts_with_pca(df)

    # Annotate
    texts_to_annotate = df["text_to_annotate"].tolist()
    annotated_texts = await call_openai_annotation(texts_to_annotate, guideline_text)
    df['raw_annotations'] = annotated_texts

    # Parse each response
    all_analyses = []
    all_annotations = []
    all_confidence_scores = []
    all_new_edge_cases = []
    all_edge_case_rules = []

    for anno_text in annotated_texts:
        data_parsed = parse_json_output(anno_text)
        all_analyses.append(data_parsed["analysis"])
        all_annotations.append(data_parsed["annotation"])
        all_confidence_scores.append(data_parsed["confidence"])
        all_new_edge_cases.append(data_parsed["new_edge_case"])
        all_edge_case_rules.append(data_parsed["new_edge_case_rule"])

    df["analyses"] = all_analyses
    df["annotation"] = all_annotations
    df["confidence"] = all_confidence_scores
    df["new_edge_case"] = all_new_edge_cases
    df["guideline_improvement"] = all_edge_case_rules

    # Save sample result with task_id
    df.to_csv(f'annotation_result_sample_{task_id}.csv', encoding='utf-8', index=False)

    return {
        "annotations": df.to_dict(orient="records"),
    }

async def process_annotation_one_json(
    example: str,
    guideline_text: str,     # used to call OpenAI for annotation
    annotation_guideline: str,          # New parameter: passed into synthesize_guideline_improvements
    uid: str | None,
    pca_model: PCA,
    kmeans_model: KMeans,
    task_id: str = None,  # Added task_id parameter
) -> Dict:
    """
    Process a single example for annotation using pre-trained PCA and KMeans models.
    
    Args:
        example: Single text example to annotate
        guideline_text: Guideline text for annotation
        annotation_guideline: Guideline text for improvement synthesis
        uid: Optional unique identifier for the example
        pca_model: Optional pre-trained PCA model
        kmeans_model: Optional pre-trained KMeans model
        task_id: Task identifier for file operations
    
    Returns:
        Dict containing the annotation results
    """
    # Wrap example into DataFrame
    df = pd.DataFrame({"text_to_annotate": [example]})

    # Set UID
    if uid:
        df["uid"] = [uid]
    else:
        df["uid"] = [str(uuid.uuid4())]

    # Get embedding for the single example
    embeddings = get_embeddings_with_cache([example], "text-embedding-3-large", client)
    
    # Transform embedding using PCA
    reduced = pca_model.transform(embeddings)
    df["pca_x"] = reduced[:, 0]
    df["pca_y"] = reduced[:, 1]
    
    # Predict cluster using KMeans
    labels = kmeans_model.predict(embeddings)
    df["cluster"] = labels

    # Annotate
    annotated_text = await call_openai_annotation([example], guideline_text)
    df['raw_annotations'] = annotated_text

    # Parse response
    data_parsed = parse_json_output(annotated_text[0])
    df["analyses"] = [data_parsed["analysis"]]
    df["annotation"] = [data_parsed["annotation"]]
    df["confidence"] = [data_parsed["confidence"]]
    df["new_edge_case"] = [data_parsed["new_edge_case"]]
    df["guideline_improvement"] = [data_parsed["new_edge_case_rule"]]

    return {
        "annotations": df.to_dict(orient="records"),
    }
