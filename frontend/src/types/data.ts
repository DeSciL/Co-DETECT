export interface DataPoint {
  text_to_annotate: string;
  uid?: string;
  cluster?: number;
  edge_case_id?: number;
  new_cluster_id: number;
  pca_x: number;
  pca_y: number;
  raw_annotations: string;
  analyses: string;
  annotation: number | string;
  confidence: number;
  new_edge_case: boolean | string;
  guideline_improvement: string;
  isReannotated?: boolean; // Flag for newly reannotated items
}

// Unified user input data interface
export interface AnnotationInput {
  annotation_guideline: string;
  textToAnnotate: string;
  uploadMethod: "paste" | "upload";
}

// Interface for request body sent to backend - updated to match backend API
export interface AnnotationRequest {
  examples: string[];
  annotation_guideline: string;  // Only string format supported by backend
  task_id: string;               // Required field in backend
  reannotate_round?: number;     // Optional field for re-annotation rounds
}

// Interface for cluster request body - updated to match backend API
export interface ClusterRequest {
  annotation_result: DataPoint[];
  annotation_guideline: string;
  task_id: string;               // Required field in backend
  reannotate_round?: number;     // Optional field for re-annotation rounds
}

// Complete format of backend API response and data structure stored in IndexedDB
export interface AnnotationResponse {
  annotations?: DataPoint[];
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
    annotation_guideline: string;  // Updated to only support string format
    uploadMethod: "paste" | "upload";
    task_id?: string;  // Optional task_id field
    reannotate_round?: number;  // Add reannotate_round field to persist round state
  };
  savedSuggestions?: Record<string, string>;
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

// Backend response types (more accurately reflects actual backend format)
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

// Updated response type definitions
export interface ReclusterResponse {
  suggestions?: Record<string, string>;
  improvement_clusters?: DataPoint[];
}

// Or if recluster_response.json is indeed array structure, define special type
export type ReclusterResponseArray = [
  Record<string, string>, // suggestions object
  DataPoint[] // improvement_clusters array
];

// Adapter function to map backend data to frontend DataPoint interface
export function mapBackendDataToDataPoint(item: BackendDataPoint | DataPoint): DataPoint {
  // If it's already a DataPoint (has new_cluster_id), return as is
  if ('new_cluster_id' in item && typeof (item as DataPoint).new_cluster_id === 'number') {
    return item as DataPoint;
  }
  
  const backendItem = item as BackendDataPoint;
  
      // Prioritize cluster field, fallback to edge_case_id
  let clusterId = 0;
  if (typeof backendItem.cluster === 'number') {
    clusterId = backendItem.cluster;
  } else if (typeof backendItem.edge_case_id === 'number') {
    clusterId = Math.floor(backendItem.edge_case_id);
  }
  
  // Generate a fallback UID if not provided by backend
  const generateUid = (text: string): string => {
    // Create a simple hash from text to maintain consistency
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `text_${Math.abs(hash)}`;
  };
  
      // Keep original annotation field content, do not convert to number
  let normalizedAnnotation: number | string = 0;
  if (typeof backendItem.annotation === 'string') {
          normalizedAnnotation = backendItem.annotation; // Keep complete string
  } else if (typeof backendItem.annotation === 'number') {
    normalizedAnnotation = backendItem.annotation;
  }
  
      // Normalize new_edge_case field
  let normalizedEdgeCase = false;
  if (typeof backendItem.new_edge_case === 'boolean') {
    normalizedEdgeCase = backendItem.new_edge_case;
  } else if (typeof backendItem.new_edge_case === 'string') {
    normalizedEdgeCase = backendItem.new_edge_case.toLowerCase() === 'true' && 
                        backendItem.new_edge_case !== 'EMPTY';
  }
  
  const mappedItem: DataPoint = {
    text_to_annotate: backendItem.text_to_annotate || "",
    uid: backendItem.uid || generateUid(backendItem.text_to_annotate || ""),
    cluster: backendItem.cluster,
    edge_case_id: backendItem.edge_case_id,
    new_cluster_id: clusterId,
    pca_x: backendItem.pca_x ?? 0,
    pca_y: backendItem.pca_y ?? 0,
    raw_annotations: backendItem.raw_annotations || "",
    analyses: backendItem.analyses || "",
    annotation: normalizedAnnotation,
    confidence: backendItem.confidence ?? 0,
    new_edge_case: normalizedEdgeCase,
    guideline_improvement: backendItem.guideline_improvement || ""
  };

  return mappedItem;
}

  // Handle special recluster_response.json structure
export function parseReclusterResponse(data: unknown): ReclusterResponse {
      // If it's normal object format
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    return {
      suggestions: (obj.suggestions as Record<string, string>) || {},
      improvement_clusters: Array.isArray(obj.improvement_clusters) 
        ? obj.improvement_clusters.map(mapBackendDataToDataPoint)
        : []
    };
  }
  
      // If it's array format [suggestions_obj, data_array]
  if (Array.isArray(data) && data.length >= 2) {
    const [suggestionsObj, clustersArray] = data;
    return {
      suggestions: suggestionsObj || {},
      improvement_clusters: Array.isArray(clustersArray) 
        ? clustersArray.map(mapBackendDataToDataPoint)
        : []
    };
  }
  
      // If it's array format but only one element is object containing suggestions
  if (Array.isArray(data) && data.length === 1 && data[0].suggestions) {
    return {
      suggestions: data[0].suggestions || {},
      improvement_clusters: []
    };
  }
  
  // Default return empty structure
  return {
    suggestions: {},
    improvement_clusters: []
  };
}

// Interface for the app state managed by useDataContext
export interface AppState {
  annotations: DataPoint[];
  previousAnnotations: DataPoint[];
  improvementClusters: DataPoint[];
  suggestions: Record<string, string>;
  savedSuggestions: Record<string, string>;
  previousGuidelines: string[];
  requestBody: AnnotationRequest | null;
  selectedPoint: DataPoint | null;
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
  currentRound: number; // Add currentRound field to track annotation rounds
}