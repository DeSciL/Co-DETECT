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
    
    if request.reannotate_round:
        round_string = f"_{request.reannotate_round}"
    else:
        round_string = ""

    annotated_data = await process_annotation_json(
        request.examples,
        request.annotation_guideline,
        request.task_id,
        round_string,
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}{round_string}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(annotated_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=annotated_data)


@app.post("/annotate_one/")
async def annotate_one(request: AnnotationRequest):
    # Basic validation to avoid empty submissions
    if not request.examples or len(request.examples) != 1:
        raise HTTPException(status_code=400, detail="Must provide exactly one example.")
    
    # Check if task_id is provided
    if not request.task_id:
        raise HTTPException(status_code=400, detail="Task ID is required.")

    assert len(request.examples) == 1

    if request.reannotate_round:
        round_string = f"_{request.reannotate_round}"
    else:
        round_string = ""

    annotated_data = await process_annotation_one_json(
        request.examples[0],
        request.annotation_guideline,
        request.task_id,
        round_string,
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}{round_string}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(annotated_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=annotated_data)


@app.post("/cluster/")
async def cluster_edge_cases(request: ClusterRequest):
    assert request.annotation_guideline
    guideline = request.annotation_guideline
    df = pd.DataFrame(request.annotation_result)
    if request.reannotate_round:
        round_string = f"_{request.reannotate_round}"
    else:
        round_string = ""

    cluster_results = await synthesize_guideline_improvements(df, guideline, request.task_id, round_string)

    # Save cluster results to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/cluster_{request.task_id}{round_string}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cluster_results, f, ensure_ascii=False, indent=2)

    return JSONResponse(content=cluster_results)
