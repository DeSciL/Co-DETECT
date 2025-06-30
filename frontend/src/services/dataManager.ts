import { indexedDBService } from './indexedDB';
import { StoredData, mapBackendDataToDataPoint, parseReclusterResponse } from '../types/data';
import { API_BASE_URL } from '../config/apiConfig';
import { getApiErrorMessage } from '../utils/errorHandling';

// Cache for frequently accessed data
class DataCache {
  private cache = new Map<string, StoredData>();
  private cacheExpiry = new Map<string, number>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, value: StoredData): void {
    this.cache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.TTL);
  }

  get(key: string): StoredData | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  clear(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

const dataCache = new DataCache();

// Optimized data manager class
export class DataManager {
  private static instance: DataManager;
  private loadingPromise: Promise<StoredData | null> | null = null;

  private constructor() {}

  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  // Debounced save function to prevent excessive IndexedDB writes
  private saveTimeout: number | null = null;
  private debouncedSave = (data: StoredData): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      
      this.saveTimeout = setTimeout(async () => {
        try {
          await indexedDBService.saveAnnotationData(data);
          dataCache.set('stored_data', data);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 500); // 500ms debounce
    });
  };

  // Load data with caching and error recovery
  async loadData(): Promise<StoredData | null> {
    // Check cache first
    const cachedData = dataCache.get('stored_data');
    if (cachedData) {
      return cachedData;
    }

    // Prevent multiple simultaneous loading operations
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.performLoad();
    const result = await this.loadingPromise;
    this.loadingPromise = null;
    
    return result;
  }

  private async performLoad(): Promise<StoredData | null> {
    try {
      const savedData = await indexedDBService.getAnnotationData();
      
      if (savedData) {
        // Validate and clean data
        const cleanedData = this.validateAndCleanData(savedData);
        dataCache.set('stored_data', cleanedData);
        return cleanedData;
      }
      
      return null;
    } catch (error) {
      console.error('Error loading data:', error);
      // Try to recover from backup if available
      return this.tryRecoverFromBackup();
    }
  }

  // Validate and clean stored data
  private validateAndCleanData(data: StoredData): StoredData {
    const cleanedData: StoredData = {
      annotations: Array.isArray(data.annotations) ? 
        data.annotations.map(mapBackendDataToDataPoint) : [],
      improvement_clusters: Array.isArray(data.improvement_clusters) ? 
        data.improvement_clusters.map(mapBackendDataToDataPoint) : [],
      suggestions: typeof data.suggestions === 'object' && data.suggestions !== null ? 
        data.suggestions : {},
      savedSuggestions: typeof data.savedSuggestions === 'object' && data.savedSuggestions !== null ? 
        data.savedSuggestions : {},
      requestData: data.requestData || null,
      previousAnnotations: Array.isArray(data.previousAnnotations) ? 
        data.previousAnnotations.map(mapBackendDataToDataPoint) : [],
      previousImprovementClusters: Array.isArray(data.previousImprovementClusters) ? 
        data.previousImprovementClusters.map(mapBackendDataToDataPoint) : [],
      previousSuggestions: typeof data.previousSuggestions === 'object' && data.previousSuggestions !== null ? 
        data.previousSuggestions : {},
      previousGuidelines: Array.isArray(data.previousGuidelines) ? data.previousGuidelines : [],
      isDemoMode: Boolean(data.isDemoMode),
      demoReannotationData: Array.isArray(data.demoReannotationData) ? 
        data.demoReannotationData.map(mapBackendDataToDataPoint) : undefined,
      demoReclusterData: Array.isArray(data.demoReclusterData) ? 
        data.demoReclusterData.map(mapBackendDataToDataPoint) : undefined,
      demoReclusterSuggestions: typeof data.demoReclusterSuggestions === 'object' && data.demoReclusterSuggestions !== null ? 
        data.demoReclusterSuggestions : undefined,
    };

    return cleanedData;
  }

  // Try to recover from backup data
  private async tryRecoverFromBackup(): Promise<StoredData | null> {
    try {
      // This could be extended to include backup strategies
      console.warn('Attempting data recovery...');
      return null;
    } catch (error) {
      console.error('Data recovery failed:', error);
      return null;
    }
  }

  // Save data with optimizations
  async saveData(data: Partial<StoredData>): Promise<void> {
    try {
      const currentData = await this.loadData();
      const defaultData: StoredData = {
        annotations: [],
        improvement_clusters: [],
        suggestions: {},
        savedSuggestions: {},
        requestData: {
          examples: [],
          annotation_guideline: "",
          uploadMethod: "paste"
        },
        previousAnnotations: [],
        previousImprovementClusters: [],
        previousSuggestions: {},
        previousGuidelines: [],
        isDemoMode: false,
      };
      
      const updatedData: StoredData = {
        ...defaultData,
        ...currentData,
        ...data,
      };
      
      await this.debouncedSave(updatedData);
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }

  // Batch update multiple data properties
  async batchUpdate(updates: Partial<StoredData>): Promise<void> {
    return this.saveData(updates);
  }

  // Clear all data and cache
  async clearData(): Promise<void> {
    try {
      await indexedDBService.clearData();
      dataCache.clear();
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  // API call with retry logic and better error handling
  async makeApiCall(
    endpoint: string, 
    body: Record<string, unknown>, 
    retries: number = 3
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`API call attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries - 1) {
          // On final attempt, throw a more informative error using centralized error handling
          const errorMessage = getApiErrorMessage(error);
          throw new Error(errorMessage);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    // This should never be reached due to the throw in the loop
    throw new Error('All API call attempts failed');
  }

  // Load demo data efficiently
  async loadDemoData(): Promise<StoredData> {
    try {
      // Use Promise.all for parallel loading
      const [annotationResponse, clusterResponse, reannotationResponse, reclusterResponse] = await Promise.all([
        fetch('/annotation_response.json'),
        fetch('/cluster_response.json'),
        fetch('/reannotation_response.json'),
        fetch('/recluster_response.json')
      ]);

      if (!annotationResponse.ok || !clusterResponse.ok || !reannotationResponse.ok || !reclusterResponse.ok) {
        throw new Error('Failed to load demo data files');
      }

      const [annotationData, clusterData, reannotationData, reclusterRawData] = await Promise.all([
        annotationResponse.json(),
        clusterResponse.json(),
        reannotationResponse.json(),
        reclusterResponse.json()
      ]);

      // Use the new parseReclusterResponse function to handle special format
      const reclusterData = parseReclusterResponse(reclusterRawData);

      const demoData: StoredData = {
        annotations: Array.isArray(annotationData.annotations) ? 
          annotationData.annotations.map(mapBackendDataToDataPoint) : [],
        suggestions: clusterData.suggestions || {},
        improvement_clusters: Array.isArray(clusterData.improvement_clusters) ? 
          clusterData.improvement_clusters.map(mapBackendDataToDataPoint) : [],
        requestData: {
          examples: annotationData.examples || [],
          annotation_guideline: "Sample task",
          uploadMethod: "paste" as const
        },
        demoReannotationData: Array.isArray(reannotationData.annotations) ? 
          reannotationData.annotations.map(mapBackendDataToDataPoint) : [],
        demoReclusterData: reclusterData.improvement_clusters,
        demoReclusterSuggestions: reclusterData.suggestions,
        isDemoMode: true,
        savedSuggestions: {},
        previousAnnotations: [],
        previousImprovementClusters: [],
        previousSuggestions: {},
        previousGuidelines: [],
      };

      await this.saveData(demoData);
      return demoData;
    } catch (error) {
      console.error('Error loading demo data:', error);
      throw error;
    }
  }

  // Memory management - clean up large objects
  cleanup(): void {
    dataCache.clear();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }
}

// Export singleton instance
export const dataManager = DataManager.getInstance(); 