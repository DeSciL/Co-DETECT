export interface DataPoint {
  text_to_annotate: string;
  uid: string;
  new_cluster_id: number; // Use new_cluster_id as the primary cluster field
  pca_x: number;
  pca_y: number;
  raw_annotations: string;
  analyses: string;
  annotation: number;
  confidence: number;
  new_edge_case: boolean;
  guideline_improvement: string;
}

// Unified user input data interface
export interface AnnotationInput {
  annotation_guideline: string;
  textToAnnotate: string;
  uploadMethod: "paste" | "upload";
}

// Interface for request body sent to backend
export interface AnnotationRequest {
  examples: string[];
  annotation_guideline: string | {
    task: string;
    labels: string[];
  };
  guideline_template?: string;
  guideline_items?: string[];
  uids?: string[];
  task_id?: string;
  previousAnnotations?: DataPoint[];
}

// Interface for cluster request body
export interface ClusterRequest {
  annotation_result: DataPoint[];
  annotation_guideline: string;
  task_id?: string;
}

// Complete format of backend API response and data structure stored in IndexedDB
export interface AnnotationResponse {
  annotations: DataPoint[];
}

export interface ClusterResponse {
  suggestions: Record<string, string>;
  improvement_clusters: DataPoint[];
}

export interface StoredData {
  annotations: DataPoint[];
  suggestions: Record<string, string>;
  improvement_clusters: DataPoint[];
  requestData: {
    examples: string[];
    annotation_guideline: string | {
      task: string;
      labels: string[];
    };
    uploadMethod: "paste" | "upload";
  };
  savedSuggestions?: Record<number, string>;
  timestamp?: string;
  previousAnnotations?: DataPoint[];
  previousImprovementClusters?: DataPoint[];
  previousSuggestions?: Record<string, string>;
  // Demo mode fields
  isDemoMode?: boolean;
  demoReannotationData?: DataPoint[];
  demoReclusterData?: DataPoint[];
  demoReclusterSuggestions?: Record<string, string>;
  // Store previous versions of the annotation guideline used in each iteration
  previousGuidelines?: string[];
}

// Backend response types (may have different field names)
interface BackendDataPoint {
  text_to_annotate?: string;
  uid?: string;
  cluster?: number;
  edge_case_id?: number;
  pca_x?: number;
  pca_y?: number;
  raw_annotations?: string;
  analyses?: string;
  annotation?: string | number;
  confidence?: number;
  new_edge_case?: string | boolean;
  guideline_improvement?: string;
  [key: string]: unknown; // Allow additional fields
}

// Adapter function to map backend data to frontend DataPoint interface
export function mapBackendDataToDataPoint(item: BackendDataPoint | DataPoint): DataPoint {
  // If it's already a DataPoint (has new_cluster_id), return as is
  if ('new_cluster_id' in item && typeof (item as DataPoint).new_cluster_id === 'number') {
    return item as DataPoint;
  }
  
  const backendItem = item as BackendDataPoint;
  
  // Map cluster field: use cluster first, then edge_case_id, fallback to 0
  let clusterId = backendItem.cluster ?? backendItem.edge_case_id ?? 0;
  
  // If we only have edge_case_id and no cluster field, use edge_case_id directly
  // This ensures each edge case gets its own unique cluster for better color distribution
  if (backendItem.cluster === undefined && backendItem.edge_case_id !== undefined) {
    // Use edge_case_id directly as cluster ID for better visualization
    clusterId = Math.floor(Number(backendItem.edge_case_id));
  }
  
  const mappedItem = {
    ...backendItem,
    // Use the mapped cluster ID
    new_cluster_id: clusterId,
    // Convert new_edge_case from string to boolean
    new_edge_case: typeof backendItem.new_edge_case === "boolean"
      ? backendItem.new_edge_case
      : !!backendItem.new_edge_case && backendItem.new_edge_case !== "EMPTY" && backendItem.new_edge_case.toLowerCase() !== "false",
    // Ensure annotation is a number
    annotation: typeof backendItem.annotation === "string"
      ? parseInt(backendItem.annotation, 10) || 0
      : (backendItem.annotation ?? 0),
    // Ensure other required fields have defaults
    text_to_annotate: backendItem.text_to_annotate || "",
    uid: backendItem.uid || "",
    pca_x: backendItem.pca_x ?? 0,
    pca_y: backendItem.pca_y ?? 0,
    raw_annotations: backendItem.raw_annotations || "",
    analyses: backendItem.analyses || "",
    confidence: backendItem.confidence ?? 0,
    guideline_improvement: backendItem.guideline_improvement || ""
  };

  // Preserve the original edge_case_id if it exists
  if (backendItem.edge_case_id !== undefined) {
    (mappedItem as DataPoint & { edge_case_id?: number }).edge_case_id = backendItem.edge_case_id;
  }

  return mappedItem as DataPoint;
}