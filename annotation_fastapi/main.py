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
    
    # Check if template and items are provided
    if request.guideline_template and request.guideline_items:
        guideline_text = request.guideline_template.replace(
            "<guidelines_here>", "\n".join(request.guideline_items)
        )
    else:
        # Use annotation_guideline directly if template/items not provided
        guideline_text = request.annotation_guideline

    if request.uids:
        assert len(request.examples) == len(request.uids)

    annotated_data = await process_annotation_json(
        request.examples,
        guideline_text,
        request.annotation_guideline,
        request.uids,
        request.task_id
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(annotated_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=annotated_data)


@app.post("/annotate_one/")
async def annotate_one(request: AnnotationRequest):
    # Basic validation to avoid empty submissions
    if not request.examples or len(request.examples) != 1:
        raise HTTPException(status_code=400, detail="Must provide exactly one example.")
    
    # Check if template and items are provided
    if request.guideline_template and request.guideline_items:
        guideline_text = request.guideline_template.replace(
            "<guidelines_here>", "\n".join(request.guideline_items)
        )
    else:
        # Use annotation_guideline directly if template/items not provided
        guideline_text = request.annotation_guideline

    # If uids are provided, use the first one, otherwise generate a new one
    assert len(request.uids) == 1
    uid = request.uids[0] if request.uids else None

    # Load pre-trained models if they exist
    pca_model = None
    kmeans_model = None
    try:
        with open(f'models/pca_model_{request.task_id}.pkl', 'rb') as f:
            pca_model = pickle.load(f)
        with open(f'models/kmeans_model_{request.task_id}.pkl', 'rb') as f:
            kmeans_model = pickle.load(f)
    except FileNotFoundError:
        logging.info(f"No pre-trained models found for task {request.task_id}, will use default clustering")

    assert len(request.examples) == 1

    annotated_data = await process_annotation_one_json(
        request.examples[0],
        guideline_text,
        request.annotation_guideline,
        uid,
        pca_model,
        kmeans_model,
        request.task_id
    )

    # Save response to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/annotation_{request.task_id}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(annotated_data, f, ensure_ascii=False, indent=2)
    
    return JSONResponse(content=annotated_data)


@app.post("/cluster/")
async def cluster_edge_cases(request: ClusterRequest):
    assert request.annotation_guideline
    guideline = request.annotation_guideline
    df = pd.DataFrame(request.annotation_result)

    cluster_results = await synthesize_guideline_improvements(df, guideline, request.task_id)

    # Save cluster results to a JSON file with task_id
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"annotation_results/cluster_{request.task_id}_{timestamp}.json"
    
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cluster_results, f, ensure_ascii=False, indent=2)

    return JSONResponse(content=cluster_results)
