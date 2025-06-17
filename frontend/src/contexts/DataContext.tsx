import React, { createContext, useReducer, useCallback } from 'react';
import { DataPoint, AnnotationRequest } from '../types/data';

// Define action types
type DataAction = 
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ANNOTATIONS'; payload: DataPoint[] }
  | { type: 'SET_PREVIOUS_ANNOTATIONS'; payload: DataPoint[] }
  | { type: 'SET_IMPROVEMENT_CLUSTERS'; payload: DataPoint[] }
  | { type: 'SET_SUGGESTIONS'; payload: Record<string, string> }
  | { type: 'SET_SAVED_SUGGESTIONS'; payload: Record<number, string> }
  | { type: 'SET_PREVIOUS_GUIDELINES'; payload: string[] }
  | { type: 'SET_REQUEST_BODY'; payload: AnnotationRequest | null }
  | { type: 'SET_SELECTED_POINT'; payload: DataPoint | null }
  | { type: 'SET_DEMO_MODE'; payload: boolean }
  | { type: 'BATCH_UPDATE'; payload: Partial<DataState> }
  | { type: 'RESET_STATE' };

// Define state type
interface DataState {
  annotations: DataPoint[];
  previousAnnotations: DataPoint[];
  improvementClusters: DataPoint[];
  suggestions: Record<string, string>;
  savedSuggestions: Record<number, string>;
  previousGuidelines: string[];
  requestBody: AnnotationRequest | null;
  selectedPoint: DataPoint | null;
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
}

// Initial state
const initialState: DataState = {
  annotations: [],
  previousAnnotations: [],
  improvementClusters: [],
  suggestions: {},
  savedSuggestions: {},
  previousGuidelines: [],
  requestBody: null,
  selectedPoint: null,
  isLoading: false,
  error: null,
  isDemoMode: false,
};

// Reducer function
function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_ANNOTATIONS':
      return { ...state, annotations: action.payload };
    case 'SET_PREVIOUS_ANNOTATIONS':
      return { ...state, previousAnnotations: action.payload };
    case 'SET_IMPROVEMENT_CLUSTERS':
      return { ...state, improvementClusters: action.payload };
    case 'SET_SUGGESTIONS':
      return { ...state, suggestions: action.payload };
    case 'SET_SAVED_SUGGESTIONS':
      return { ...state, savedSuggestions: action.payload };
    case 'SET_PREVIOUS_GUIDELINES':
      return { ...state, previousGuidelines: action.payload };
    case 'SET_REQUEST_BODY':
      return { ...state, requestBody: action.payload };
    case 'SET_SELECTED_POINT':
      return { ...state, selectedPoint: action.payload };
    case 'SET_DEMO_MODE':
      return { ...state, isDemoMode: action.payload };
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Context type
interface DataContextType {
  state: DataState;
  dispatch: React.Dispatch<DataAction>;
  batchUpdate: (updates: Partial<DataState>) => void;
  resetState: () => void;
}

// Create context
const DataContext = createContext<DataContextType | undefined>(undefined);

// Export the context for use in custom hooks
export { DataContext };

// Provider component
export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(dataReducer, initialState);

  const batchUpdate = useCallback((updates: Partial<DataState>) => {
    dispatch({ type: 'BATCH_UPDATE', payload: updates });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const value = {
    state,
    dispatch,
    batchUpdate,
    resetState,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

 