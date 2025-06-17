from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict

# This is a new file: created to store structured request and response models


# Main input structure
class AnnotationRequest(BaseModel):
    examples: List[str]  # List of input texts to annotate
    annotation_guideline: str  ### New: full text from frontend, used in synthesis
    guideline_template: Optional[str] = None  ### Now optional
    guideline_items: Optional[List[str]] = None  ### Now optional
    uids: Optional[List[str]] = None
    task_id: str  # Added task_id field


class AnnotationResult(TypedDict):
    text_to_annotate: str
    uid: str
    cluster: int
    pca_x: float
    pca_y: float
    raw_annotations: str
    analyses: str
    annotation: int
    confidence: float
    guideline_improvement: str


class ClusterRequest(BaseModel):
    annotation_result: List[Dict[str, Any]]  # Dictionary of all annotation results. Should have fields: analyses, annotation, confidence, guideline_improvement
    annotation_guideline: str  # Annotation guideline as a string
    task_id: str  # Added task_id field


# Annotation output structure (optional for clarity)
class AnnotationOutput(BaseModel):
    text_to_annotate: str
    annotation: str
    confidence: int
    analysis: str
    guideline_improvement: str
    cluster: int
    pca_x: float
    pca_y: float

