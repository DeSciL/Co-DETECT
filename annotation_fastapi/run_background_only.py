import pandas as pd
import requests
import json
import os


GUIDELINE = """Please annotate if a social media post contains hate speech or not.

A post contains hate speech if it contains any of the following aspects:
- Assaults on Human Dignity: Does the post demean or degrade individuals or groups based on race, ethnicity, gender, religion, sexual orientation, or other protected characteristics?
- Calls for Violence: Does the post incite or encourage physical harm or violence against individuals or groups?
- Vulgarity and/or Offensive Language: Does the post contain profanity, slurs, or other offensive language that may or may not be directed at individuals or groups?

Labels:
- 0 (the post contains no hate speech)
- 1 (the post contains hate speech)
"""


print(GUIDELINE)

if __name__ == '__main__':
    url = "http://127.0.0.1:8000/annotate/"
    file_to_annotate = 'example/ghc_rnd.csv'
    df_to_annotate = pd.read_csv(file_to_annotate)
    data = {
        "examples": df_to_annotate['text_to_annotate'].tolist(),
        "annotation_guideline": GUIDELINE,
        "task_id": "ghc_rnd",
    }
    
    response = requests.post(url, json=data)
    print("Status Code:", response.status_code)
    print("Response:", response.json())

    cluster_url = "http://127.0.0.1:8000/cluster/"
    cluster_input = {
        "annotation_result": pd.read_csv('annotation_result_sample_ghc_rnd_0.csv').to_dict(orient="records"),
        "annotation_guideline": GUIDELINE,
        "task_id": "ghc_rnd",
    }
    cluster_response = requests.post(cluster_url, json=cluster_input)
    print("Status Code:", cluster_response.status_code)
    print("Response:", cluster_response.json())
    
    # # Save cluster response to JSON file
    # os.makedirs('cluster_result', exist_ok=True)
    # with open('cluster_result/cluster_response.json', 'w', encoding='utf-8') as f:
    #     json.dump(cluster_response.json(), f, ensure_ascii=False, indent=2)

    # First, reannotate samples from clustered results
    url = "http://127.0.0.1:8000/annotate/"
    
    # Load clustered results
    clustered_df = pd.read_csv('clustered_results_ghc_rnd_0.csv')
    
    new_guideline = GUIDELINE + "\n\nEdge Case Handling:\n"

    unique_rules = clustered_df.sort_values('edge_case_id', ascending=True).drop_duplicates(subset=['edge_case_id'])['guideline_improvement'].tolist()
    for i, rule in enumerate(unique_rules):
        new_guideline += f"{i+1}. {rule}\n"

    print(new_guideline)

    previous_annotation_result = pd.read_csv('annotation_result_sample_ghc_rnd_0.csv')
    # Prepare data for reannotation
    reannotation_data = {
        "examples": previous_annotation_result['text_to_annotate'].tolist(),
        "annotation_guideline": new_guideline,
        "task_id": "ghc_rnd",
        "reannotate_round": 1,
        # "uids": previous_annotation_result['uid'].tolist()  # Preserve UIDs
    }
    
    # Make reannotation request
    reannotation_response = requests.post(url, json=reannotation_data)
    print("Reannotation Status Code:", reannotation_response.status_code)
    print("Reannotation Response:", reannotation_response.json())
    
    # Second clustering using reannotation results
    second_cluster_url = "http://127.0.0.1:8000/cluster/"
    
    # Load the reannotation results (assuming they are saved as a CSV file)
    # You may need to adjust the filename based on your actual output
    reannotation_result_file = 'annotation_result_sample_ghc_rnd_1.csv'
    
    # If the file doesn't exist, we'll use the response data directly
    if os.path.exists(reannotation_result_file):
        reannotation_results = pd.read_csv(reannotation_result_file).to_dict(orient="records")
    else:
        # Create reannotation results from the response if file doesn't exist
        print("Warning: Reannotation result file not found, using response data")
        reannotation_results = []
        if 'result' in reannotation_response.json():
            for item in reannotation_response.json()['result']:
                reannotation_results.append(item)
    
    second_cluster_input = {
        "annotation_result": reannotation_results,
        "annotation_guideline": new_guideline,
        "task_id": "ghc_rnd",
        "reannotate_round": 1,
    }
    
    second_cluster_response = requests.post(second_cluster_url, json=second_cluster_input)
    print("Second Cluster Status Code:", second_cluster_response.status_code)
    print("Second Cluster Response:", second_cluster_response.json())
    
    # Save second cluster response to JSON file
    os.makedirs('cluster_result', exist_ok=True)
    with open('cluster_result/second_cluster_response.json', 'w', encoding='utf-8') as f:
        json.dump(second_cluster_response.json(), f, ensure_ascii=False, indent=2)


    # Test /annotate_one/
    test_example = "#Europe #Germany #Rape #Islam #Muslims #Migrants #MuslimMigrants #Immigration #IslamicImmigration "
    url = "http://127.0.0.1:8000/annotate_one/"
    annotate_one_data = {
        "examples": [test_example],
        "annotation_guideline": GUIDELINE,
        "task_id": "ghc_rnd",
        "reannotate_round": 0,
    }

    annotate_one_response = requests.post(url, json=annotate_one_data)
    print("Annotate One Status Code:", annotate_one_response.status_code)
    print("Annotate One Response:", annotate_one_response.json())
