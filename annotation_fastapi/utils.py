import io
import openai
import diskcache as dc
import asyncio
import json
from litellm import completion, acompletion
from tqdm import tqdm
from typing import List
import re
import pandas as pd
import os
import logging
import ast
import time
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file
OPENAI_API = os.getenv('OPENAI_API_KEY', None)  # Default to None if not found
DEEPSEEK_API = os.getenv('DEEPSEEK_API_KEY', None)  # Default to None if not found
DEFAULT_MODEL = 'gpt-4.1'
openai.api_key = OPENAI_API

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("utils")  # Create/retrieve a named logger
logger.setLevel(logging.INFO)
logging.getLogger("LiteLLM").setLevel(logging.WARNING)

MODEL_DICT = {
    'o1': 'o1',
    'o3-mini': 'o3-mini',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4o': 'gpt-4o',
    'gpt-4.1': 'gpt-4.1-2025-04-14',
    # 'deepseek-chat': 'together_ai/deepseek-ai/DeepSeek-V3',
    # 'deepseek-reasoner': "together_ai/deepseek-ai/DeepSeek-R1",
    'deepseek-chat': 'deepseek/deepseek-chat',
    'deepseek-reasoner': "deepseek/deepseek-reasoner",
    'qwq-32b': 'together_ai/Qwen/QwQ-32B',
    'sonnet-3.7-high': "anthropic/claude-3-7-sonnet-20250219",
    'gemini-2.5-pro': "gemini/gemini-2.5-pro-preview-03-25",
    'llama_405': "together_ai/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    'llama_70': "together_ai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
    'llama4_maverick': "together_ai/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    'gemma3': "together_ai/google/gemma-3-12b-it",
}
INPUT_COST_DICT = {
    'o1': 15,
    'o3-mini': 1.1,
    'gpt-4o-mini': 0.15,
    'gpt-4o': 2.5,
    'gpt-4.1': 2,
    'deepseek-chat': 0.27,
    'deepseek-reasoner': 0.55,
    # 'deepseek-chat': 1.25,
    # 'deepseek-reasoner': 3,
    'qwq-32b': 1.2,
    'sonnet-3.7-high': 3,
    'gemini-2.5-pro': 1.25,
    'llama_405': 3.5,
    'llama_70': 0.88,
    'llama4_maverick': 0.27,
    'gemma3': 0.3,
}
OUTPUT_COST_DICT = {
    'o1': 60,
    'o3-mini': 4.4,
    'gpt-4o-mini': 0.6,
    'gpt-4o': 10,
    'gpt-4.1': 8,
    'deepseek-chat': 1.10,
    'deepseek-reasoner': 2.19,
    # 'deepseek-chat': 1.25,
    # 'deepseek-reasoner': 7,
    'qwq-32b': 1.2,
    'sonnet-3.7-high': 15,
    'gemini-2.5-pro': 2.5,
    'llama_405': 3.5,
    'llama_70': 0.88,
    'llama4_maverick': 0.85,
    'gemma3': 0.3,
}
GENE_ARGS_DICT = {
    'gpt-4o-mini': {'temperature': 0, 'max_tokens': 4096, 'seed': 42},
    'gpt-4.1': {'temperature': 0, 'max_tokens': 4096, 'seed': 42},
    'deepseek-reasoner': {'temperature': 0.6, 'max_tokens': 8192},
    'qwq-32b': {'temperature': 0.6, 'top_p': 0.95, 'max_tokens': 8192},
    'o3-mini': {'reasoning_effort': 'high', 'max_tokens': 8192, 'seed': 42},
    'sonnet-3.7-high': {'reasoning_effort': 'high', 'max_tokens': 8192},
    'gemini-2.5-pro': {'max_tokens': 8192},
    'deepseek-chat': {'temperature': 0, 'max_tokens': 4096},
    'llama_405': {'temperature': 0, 'max_tokens': 4096},
    'llama_70': {'temperature': 0, 'max_tokens': 4096},
    'llama4_maverick': {'temperature': 0, 'max_tokens': 4096},
    'gemma3': {'temperature': 0, 'max_tokens': 4096},
}

SYSTEM_PROMPT = "You are an expert annotator. Your task is to analyze text samples according to specific guidelines and handle edge cases systematically."
ANNOTATION_PROMPT = {
    'version_1': """Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Here is the text you need to annotate:
<text>
{text}
</text>

Your response must be in the following JSON format:
{{
  "analysis": "Explain whether the text clearly matches the guideline or is an edge case. Provide reasoning.",
  "annotation": "Your label based on the guideline.",
  "confidence": 0-100,  // Integer score indicating how confident you are in your annotation.
  "guideline_improvement": "If your confidence is low, suggest a change to the guideline that would make the annotation decision more clear. If your confidence is high, reply EMPTY"
}}
""",
    'version_2': """Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Required Workflow:
1. Granular Analysis: 
Systematically evaluate the text against EVERY criterion in the guidelines. For each requirement:
    - State the specific guideline component being checked 
    - Explicitly state whether it is satisfied/not satisfied  
    - Cite relevant text evidence

2. Annotation: Combine your analysis to determine the final label  

3. Confidence Assessment:
Rate confidence from 0-100 based on:  
   - Clarity of guideline matches  
   - Presence of ambiguous indicators  
   - Completeness of evidence  

4. Edge Case Handling: 
If you have a low confidence:
 Propose a NEW rule when:  
   a) Current guidelines are ambiguous for this case **AND**  
   b) The scenario could recur in other samples  
   Format: "When <specific observable condition>, <action>"  
   Examples:  
   - "When X and Y co-occur but Z is absent, classify as neutral"  
   - "If context suggests both A and B, refuse to classify (-1)"

5. Rule Keywords:
For proposed edge case rules:  
   - Extract 3-5 conceptual keywords (nouns/verbs)  
   - Must represent core rule components  
   - Avoid overly specific terms

Response Format:
{{
  "analysis": "Step-by-step evaluation of ALL guideline criteria with text evidence",
  "annotation": "Final label or -1 if unclassifiable",
  "confidence": "Integer 0-100 based on evidence strength",
  "edge_case_rule": "EMPTY or New rule using 'When...' format",
  "edge_case_keywords": ["list", "of", "conceptual", "terms"]
}}

<text_to_annotate>
{text}
</text_to_annotate>
""",
    'version_3': """You are an expert annotator. Your task is to analyze text samples according to specific guidelines and handle edge cases systematically.

Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Required Workflow:
1. Granular Analysis: 
Systematically evaluate the text against EVERY criterion in the guidelines. For each requirement:
    - State the specific guideline component being checked 
    - Explicitly state whether it is satisfied/not satisfied  
    - Cite relevant text evidence

2. Annotation: Combine your analysis to determine the final label. If you feel it is unclassifiable given the guidelines and defined labels, feel free to annotate -1.

3. Confidence Assessment:
Rate confidence from 0-100 based on:  
   - Clarity of guideline matches  
   - Presence of ambiguous indicators  
   - Completeness of evidence  

4. Edge Case Rule: 
If your confidence is less than or equal to 70:
  Propose a NEW rule when:  
   a) Current guidelines are ambiguous for this case **AND**  
   b) The scenario could recur in other samples  
   Format: "When <observable condition> -> <action>"  
   Examples:  
   - "When X and Y co-occur but Z is absent -> classify as neutral"  
   - "If context suggests both A and B -> refuse to classify (-1)"
   c) The observable condition should not be too specific to make the rule generalizable to other samples.
Else:
  Respond EMPTY

5. Rule Label:
For proposed edge case rule (if not EMPTY), give it a label summarize it concise and precisely. Keep it generic since the label will later be used to compared to other rules to check if they can be aggregated together or not.


Response Format:
{{
  "analysis": "Step-by-step evaluation of ALL guideline criteria with text evidence",
  "annotation": "Final label or -1 if unclassifiable",
  "confidence": "Integer 0-100 based on evidence strength",
  "edge_case_rule": "EMPTY or New rule using 'When <condition> -> <action>' format",
  "rule_label": "EMPTY or a brief label that generically, concisely, but also precisely summarize the rule."
}}

<text_to_annotate>
{text}
</text_to_annotate>""",
    'version_4': """You are an expert annotator. Your task is to analyze text samples according to specific guidelines and handle edge cases systematically.

Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Required Workflow:
1. Granular Analysis: 
Systematically evaluate the text against EVERY criterion in the guidelines. For each requirement:
    - State the specific guideline component being checked 
    - Explicitly state whether it is satisfied/not satisfied  
    - Cite relevant text evidence

2. Annotation: Combine your analysis to determine the final label. If you feel it is unclassifiable given the guidelines and defined labels, feel free to annotate -1.

3. Confidence Assessment:
Rate confidence from 0-100 based on:  
   - Clarity of guideline matches  
   - Presence of ambiguous indicators  
   - Completeness of evidence  

4. Edge Case Rule: 
If your confidence is less than or equal to 70, or you find it unclassifiable given the current guidelines:
  Propose a NEW rule when:  
   a) Current guidelines are ambiguous for this case **AND**  
   b) The scenario could recur in other samples  
   Format: "When <observable condition> -> <action>"  
   Examples:  
   - "When X and Y co-occur but Z is absent -> classify as neutral"  
   - "If context suggests both A and B -> refuse to classify (-1)"
   c) The observable condition should not be too specific to make the rule generalizable to other samples.
Else:
  Respond EMPTY

Response Format:
{{
  "analysis": "Step-by-step evaluation of ALL guideline criteria with text evidence",
  "annotation": "Final label or -1 if unclassifiable",
  "confidence": "Integer 0-100 based on evidence strength",
  "edge_case_rule": "New rule using 'When <condition> -> <action>' format; or EMPTY if it is not an edge case",
}}

<text_to_annotate>
{text}
</text_to_annotate>""",
    'version_5': """You are an expert annotator. Your task is to analyze text samples according to specific guidelines and handle edge cases systematically.

Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Required Workflow:
1. Granular Analysis: 
Systematically evaluate the text against EVERY criterion in the guidelines. For each requirement:
    - State the specific guideline component being checked 
    - Explicitly state whether it is satisfied/not satisfied  
    - Cite relevant text evidence

2. Annotation: Combine your analysis to determine the final label. If you feel it is unclassifiable given the guidelines and defined labels, feel free to annotate -1.

3. Confidence Assessment:
Rate confidence from 0-100 based on:  
   - Clarity of guideline matches  
   - Presence of ambiguous indicators  
   - Completeness of evidence  

4. Edge Case Rule: 
If confidence ≤ 75 or annotation = -1:
Propose a generalizable edge case rule, **sticking** to the format: "When <observable condition> -> <action>"
The <observable condition> should not be too specific to be **GENERALIZABLE**, and properly describe the current edge case.  
Examples:
- "When X and Y co-occur but Z is absent -> classify as xxx"  
- "If context suggests both A and B -> refuse to classify (-1)"
- Bad Generalizability: When the text says ‘penguins in Antarctica’ on May 3, 2021 ... -> <action>
- Good Generalizability: When a rare entity is mentioned with no supporting context ... -> <action>

If confidence > 75 and annotation ≠ -1, output the string "EMPTY".

Response Format:
{{
  "analysis": "Step-by-step evaluation of ALL guideline criteria with text evidence",
  "annotation": "Final label or -1 if unclassifiable",
  "confidence": "Integer 0-100 based on evidence strength",
  "edge_case_rule": "If your confidence less than or equal to 75 or annotation is -1, give an edge case rule in 'When <condition> -> <action>' format (DON'T forget the arrow ->); Otherwise write EMPTY",
}}

<text_to_annotate>
{text}
</text_to_annotate>""",
'version_6': """Here is the annotation task:
<annotation_guideline>
{guideline}
</annotation_guideline>

Required Workflow:
1. Granular Analysis: 
Systematically evaluate the text against EVERY criterion in the guidelines. For each requirement:
    - State the specific guideline component being checked 
    - Explicitly state whether it is satisfied/not satisfied  
    - Cite relevant text evidence

2. Annotation: Combine your analysis to determine the final label. If you feel it is unclassifiable given the guidelines and defined labels, feel free to annotate -1.

3. Confidence Assessment:
Rate your annotation confidence from 0-100. If the sample is ambiguous to annotate given the annotation guideline, and no edge case handling strategy is mentioned, give a low confidence score. If the sample exhibits clear evidence according to the guideline or there is applicable edge case handling rule, give a high confidence score.

4. New Edge Case or Not:
Th case is a new edge case if:
   - Confidence ≤ 75 or annotation = -1; AND
   - It is not covered by existing edge case handling rules. (If classifying -1 following an exist edge case handling rule or guideline, it is not a new edge case)

5. New Edge Case Rule:
If it is a new edge case:
Propose a generalizable edge case rule, **sticking** to the format: "When <observable condition> -> <action>"
The <observable condition> should not be too specific to be **GENERALIZABLE**, and properly describe the current edge case.  
Examples:
- "When X and Y co-occur but Z is absent -> classify as xxx"  
- "If context suggests both A and B -> refuse to classify (-1)"
- Bad Generalizability: When the text says ‘penguins in Antarctica’ on May 3, 2021 ... -> <action>
- Good Generalizability: When a rare entity is mentioned with no supporting context ... -> <action>

If it is not a new edge case, output the string "EMPTY".

Response Format:
{{
  "analysis": "Step-by-step evaluation of ALL guideline criteria with text evidence",
  "annotation": "Final label or -1 if unclassifiable",
  "confidence": Integer 0-100 indicate your annotation confidence,
  "new_edge_case": Boolean True or False indicate if it is a new edge case or not,
  "new_edge_case_rule": "If it is a new edge case, give an edge case rule in 'When <condition> -> <action>' format (DON'T forget the arrow ->); Otherwise write EMPTY",
}}

<text_to_annotate>
{text}
</text_to_annotate>
""",
}
VERSION = 'version_6'


def get_input_price(model, input_len=None):
    input_cost = input_len / 1000000 * INPUT_COST_DICT[model]
    return input_cost


def get_output_price(model, output_len=None):
    output_cost = output_len / 1000000 * OUTPUT_COST_DICT[model]
    return output_cost


async def achat(model, messages, generation_args):
    if generation_args is None:
        generation_args = GENE_ARGS_DICT[model]
    output = await acompletion(model=MODEL_DICT[model], messages=messages, **generation_args)
    input_token_num = output.usage.prompt_tokens
    output_token_num = output.usage.completion_tokens
    try:
        reasoning_content = output.choices[0].message.reasoning_content
    except Exception as e:
        reasoning_content = None
    return output.choices[0].message.content, reasoning_content, input_token_num, output_token_num


def batchify(lst, batch_size):
    """Split the list `lst` into sublists of size `batch_size`."""
    return [lst[i:i + batch_size] for i in range(0, len(lst), batch_size)]


async def create_answers_async(model, messages, cache_path, generation_args, batch_size=20):
    # async answering
    batched_msgs = batchify(messages, batch_size)
    total_input_tok_num = 0
    total_output_tok_num = 0
    print("{} batches to run.".format(len(batched_msgs)))
    all_answers = []
    cache_settings = dc.DEFAULT_SETTINGS.copy()
    cache_settings["eviction_policy"] = "none"
    cache_settings["size_limit"] = int(1e12)
    cache_settings["cull_limit"] = 0
    error_batches = []
    with dc.Cache(cache_path, **cache_settings) as litellm_responses:
        for i, batch in tqdm(enumerate(batched_msgs), total=len(batched_msgs)):
            mapping_list = []
            cache_miss_msgs = []
            cache_hit_responses = []
            for msg_in_batch in batch:
                if (model, msg_in_batch) in litellm_responses:
                    mapping_list.append(len(cache_hit_responses) + 1)
                    cache_hit_responses.append(litellm_responses[(model, msg_in_batch)]['response'])
                else:
                    mapping_list.append(- len(cache_miss_msgs) - 1)
                    cache_miss_msgs.append(msg_in_batch)

            if len(cache_miss_msgs) == 0:
                all_answers.extend(cache_hit_responses)
                print(f"Batch {i} entirely Loaded")
            else:
                try:
                    api_responses = await asyncio.gather(*[achat(model, m, generation_args) for m in cache_miss_msgs])
                    answers, reasoning_contents, input_tok_nums, output_tok_nums = zip(*api_responses)
                    total_input_tok_num += sum(input_tok_nums)
                    total_output_tok_num += sum(output_tok_nums)
                    for msg, res, reasoning in zip(cache_miss_msgs, answers, reasoning_contents):
                        litellm_responses[(model, msg)] = {'response': res, 'response_reasoning': reasoning}
                    merged_responses = []
                    for idx in mapping_list:
                        if idx > 0:
                            merged_responses.append(cache_hit_responses[idx - 1])
                        else:
                            merged_responses.append(answers[- idx - 1])
                    all_answers.extend(merged_responses)
                    print(f"Batch {i} Done")
                except Exception as e:
                    print(f"Batch {i} Error while gathering answers: {e}")
                    error_batches.append(i)

    input_price = get_input_price(model, total_input_tok_num)
    output_price = get_output_price(model, total_output_tok_num)
    return all_answers, error_batches, input_price + output_price


def parse_json_output(response):
    response = response.replace('```json', '').replace('```', '').strip('\n ')
    if '</think>' in response:
        response = response.split('</think>')[1]
    try:
        data = json.loads(response)
        assert 'analysis' in data.keys()
        assert 'annotation' in data.keys()
        assert 'confidence' in data.keys()
        assert 'new_edge_case' in data.keys()
        assert 'new_edge_case_rule' in data.keys()
        # assert 'rule_label' in data.keys()
    except Exception as e:
        logger.error(str(e))
        analysis = response.split(": \"", 1)[-1].split("\"annotation\"")[0].strip(' \n"\',')
        res_lines = response.split('\n')
        annotation = -1
        edge_case_rule = None
        # rule_label = None
        confidence_score = 50.0
        for line in res_lines:
            if 'annotation' in line:
                annotation = line.split(':')[-1].strip(' \n"\',')
            elif 'new_edge_case_rule' in line:
                edge_case_rule = line.split(':')[-1].strip(' \n"\',')
            elif 'new_edge_case' in line:
                new_edge_case = 'true' in line.lower()
            elif 'confidence' in line:
                try:
                    score_match = re.search(r'\d+\.?\d*', line)
                    score = float(score_match.group())
                    confidence_score = score
                except Exception as e:
                    pass
        data = {
            'analysis': analysis,
            'annotation': annotation,
            'confidence': confidence_score,
            'new_edge_case': new_edge_case,
            'new_edge_case_rule': edge_case_rule,
        }
    return data


async def read_file_content(uploaded_file):
    content = await uploaded_file.read()
    return io.StringIO(content.decode("utf-8"))


async def call_openai_annotation(texts: List[str], guideline: str) -> List[str]:
    prompts_to_run = [ANNOTATION_PROMPT[VERSION].format(guideline=guideline, text=t) for t in texts]
    messages = [[{'role': 'system', 'content': SYSTEM_PROMPT}, {'role': 'user', 'content': p}] for p in prompts_to_run]
    total_cost = 0
    while True:
        responses, err_batches, cost = await create_answers_async(DEFAULT_MODEL, messages, cache_path=os.path.join('openai_cache', f"openai.diskcache"), generation_args=GENE_ARGS_DICT[DEFAULT_MODEL])
        total_cost += cost
        if len(err_batches) == 0:
            break
    logger.info(f"Total cost {total_cost}")
    return responses


async def call_openai(messages, model) -> List[str]:
    total_cost = 0
    while True:
        responses, err_batches, cost = await create_answers_async(model, messages,
                                                                  cache_path=os.path.join('openai_cache',
                                                                                          f"{model}.diskcache"), generation_args=GENE_ARGS_DICT[model])
        total_cost += cost
        if len(err_batches) == 0:
            break
    logger.info(f"Total cost {total_cost}")
    return responses


def parse_aggregation(response):
    match = re.search(r"```json\s*(.*?)\s*```", response, re.DOTALL)
    json_str = match.group(1) if match else response
    json_str = json_str.strip(" \n")

    try:
        # First, try to load as standard JSON
        data = json.loads(json_str)
        # Check if structure is as expected
        assert isinstance(data, dict) and "categories" in data
        for cat in data["categories"]:
            assert "category_description" in cat and "edge_cases" in cat
        return data["categories"]
    except Exception as e:
        logger.warning(f"Standard JSON parsing failed: {e}. Trying line-by-line recovery.")
        categories = []
        current_description = None
        current_edge_cases = None

        lines = json_str.splitlines()
        for line in lines:
            # Remove whitespace and commas
            line = line.strip().rstrip(',')
            # Category description line
            match_desc = re.match(r'"?category_description"?\s*:\s*"([^"]+)"', line)
            if match_desc:
                if current_description and current_edge_cases is not None:
                    categories.append({
                        "category_description": current_description,
                        "edge_cases": current_edge_cases
                    })
                current_description = match_desc.group(1)
                current_edge_cases = None
            # Edge cases line
            match_cases = re.match(r'"?edge_cases"?\s*:\s*\[([^\]]*)\]', line)
            if match_cases:
                nums = re.findall(r'\d+', match_cases.group(1))
                current_edge_cases = [int(n) for n in nums]
        # Add the last category if exists
        if current_description and current_edge_cases is not None:
            categories.append({
                "category_description": current_description,
                "edge_cases": current_edge_cases
            })

    return categories


def parse_merge(response):
    if 'NO MERGE' in response:
        return []
    else:
        lines = response.split('\n')
        result = []
        for line in lines:
            merge_match = re.match(r'Merge (\[[^\[\]]*\])', line)
            if merge_match:
                result.append({
                    'merge': ast.literal_eval(merge_match.group(1)),
                    'merged_rule': line.split(': ')[-1].strip()
                })
        return result


def get_embeddings_with_cache(texts, model, client):
    """
    Returns the embedding for a given text and model, using diskcache for caching.
    If embedding is cached, returns from cache. Otherwise, computes and stores in cache.

    Args:
        text (str): The text to embed.
        model (str): Embedding model name.
        client: The embedding client (must have embeddings.create method).
        cache_dir (str): Directory for diskcache.

    Returns:
        embedding (list/np.ndarray): The embedding vector.
    """
    with dc.Cache(os.path.join('openai_cache', f"embedding.diskcache")) as cache:
        keys = [(text, model) for text in texts]

        # 1. Find uncached texts
        to_embed = []
        to_embed_idxs = []
        for i, key in enumerate(keys):
            if key not in cache:
                to_embed.append(texts[i])
                to_embed_idxs.append(i)

        # 2. Batch embed uncached
        if to_embed:
            response = client.embeddings.create(input=to_embed, model=model)
            # Assuming response.data is ordered and each .embedding is the vector
            for i, emb in zip(to_embed_idxs, response.data):
                cache[keys[i]] = emb.embedding

        # 3. Gather all embeddings (order matches input)
        embeddings = [cache[key] for key in keys]

    return embeddings


if __name__ == '__main__':
    sample_string = """Category 1: When a post uses widely recognized slurs, vulgar language, or offensive terms inherently tied to protected characteristics (e.g., racial slurs), regardless of explicit targeting, unless part of an established neutral context (e.g., common idioms) without demeaning intent.
Edge Cases in Category 1: [1, 3]

Category 2: When language indirectly references protected groups through coded terms, historical terminology, medicalizing language, neologisms, or ambiguous phrasing, classify as hate speech only if contextual evidence indicates demeaning/degrading intent or clear targeting.
Edge Cases in Category 2: [4, 5, 6, 7, 8]

Category 3: When language targets non-protected groups (e.g., occupations, roles) or uses derogatory terms for unidentifiable protected groups, classify as no hate speech unless a protected characteristic is explicitly or implicitly involved.
Edge Cases in Category 3: [2, 9]

### Explanation of Categories:
1. **Explicit Slurs/Offensive Language**: Covers unambiguous slurs or offensive terms tied to protected characteristics, even if not directed, but excludes neutral idioms (e.g., "rule of thumb" with no derogatory intent).
2. **Context-Dependent Targeting**: Addresses indirect, coded, or historically charged language where intent must be inferred from context (e.g., dogwhistles, medicalizing terms).
3. **Non-Protected Targets**: Ensures hate speech labels apply only to protected characteristics, excluding generic insults or attacks on non-protected groups.

All edge cases are covered without overlap, and categories reflect distinct decision-making criteria (explicit language, contextual intent, target identity)."""
    result = parse_aggregation(sample_string)
    print(result)

