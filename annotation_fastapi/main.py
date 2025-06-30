import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from models import AnnotationRequest, ClusterRequest
from services import process_annotation_json, synthesize_guideline_improvements, process_annotation_one_json
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import datetime
import pickle
import logging
import math

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Ensure results directory exists
os.makedirs("annotation_results", exist_ok=True)
os.makedirs("models", exist_ok=True)

def clean_json_data(data):
    """
    Recursively clean invalid floating point values in data, replacing NaN and Infinity with None
    """
    if isinstance(data, dict):
        return {k: clean_json_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_json_data(item) for item in data]
    elif isinstance(data, float):
        if math.isnan(data):
            return None
        elif math.isinf(data):
            return None
        else:
            return data
    else:
        return data

# This endpoint replaces the old file-based version
# Accepts a JSON request with:
# - examples: List of texts to annotate
# - annotation_guideline: A string with annotation guidelines


@app.post("/annotate/")
async def annotate_texts(request: AnnotationRequest):
    # Basic validation to avoid empty submissions
    if not request.examples:
        raise HTTPException(status_code=400, detail="Empty input.")
    
    # Check if task_id is provided
    if not request.task_id:
        raise HTTPException(status_code=400, detail="Task ID is required.")
    
    round_string = f"_{request.reannotate_round}"

    print(f"Processing examples: {len(request.examples)}")
    annotated_data = await process_annotation_json(
        request.examples,
        request.annotation_guideline,
        request.task_id,
        round_string,
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}{round_string}_{timestamp}.json"
    
    # Clean data before saving and returning
    cleaned_data = clean_json_data(annotated_data)
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=cleaned_data)


@app.post("/annotate_one/")
async def annotate_one(request: AnnotationRequest):
    # Basic validation to avoid empty submissions
    if not request.examples or len(request.examples) != 1:
        raise HTTPException(status_code=400, detail="Must provide exactly one example.")
    
    # Check if task_id is provided
    if not request.task_id:
        raise HTTPException(status_code=400, detail="Task ID is required.")

    assert len(request.examples) == 1

    round_string = f"_{request.reannotate_round}"

    annotated_data = await process_annotation_one_json(
        request.examples[0],
        request.annotation_guideline,
        request.task_id,
        round_string,
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}{round_string}_{timestamp}.json"
    
    # Clean data before saving and returning
    cleaned_data = clean_json_data(annotated_data)
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=cleaned_data)


@app.post("/cluster/")
async def cluster_edge_cases(request: ClusterRequest):
    assert request.annotation_guideline
    guideline = request.annotation_guideline
    df = pd.DataFrame(request.annotation_result)
    round_string = f"_{request.reannotate_round}"

    cluster_results = await synthesize_guideline_improvements(df, guideline, request.task_id, round_string)

    # Save cluster results to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/cluster_{request.task_id}{round_string}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cluster_results, f, ensure_ascii=False, indent=2)

    # Clean data before returning JSON response
    cleaned_results = clean_json_data(cluster_results)
    
    return JSONResponse(content=cleaned_results)
