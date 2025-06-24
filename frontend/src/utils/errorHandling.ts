/**
 * Utility functions for consistent error handling across the application
 */

/**
 * Converts various types of API errors into user-friendly error messages
 * Specifically handles connection issues when backend server is not running
 */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    // This is typically a connection refused error
    return "Cannot connect to the annotation service. Please make sure the backend server is running and try again.";
  }
  
  if (error instanceof Error) {
    if (error.message.includes("ERR_CONNECTION_REFUSED") || error.message.includes("net::ERR_CONNECTION_REFUSED")) {
      return "Connection refused: The backend annotation service is not available. Please start the backend server and try again.";
    }
    
    if (error.message.includes("ERR_NETWORK")) {
      return "Network error: Cannot reach the annotation service. Please check your connection and backend server status.";
    }
    
    if (error.message.includes("HTTP error! Status: 404")) {
      return "Annotation endpoint not found. Please check if the backend server is running the correct version.";
    }
    
    if (error.message.includes("HTTP error! Status: 500")) {
      return "Backend server error. Please check the backend server logs for more details.";
    }
    
    if (error.message.includes("HTTP error! Status: 503")) {
      return "Backend service unavailable. The server may be overloaded or temporarily down.";
    }
    
    return error.message;
  }
  
  return "An unknown error occurred";
}

/**
 * Determines if an error is likely due to backend server being unavailable
 */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }
  
  if (error instanceof Error) {
    return error.message.includes("ERR_CONNECTION_REFUSED") ||
           error.message.includes("net::ERR_CONNECTION_REFUSED") ||
           error.message.includes("ERR_NETWORK");
  }
  
  return false;
}

/**
 * Wraps an async function with consistent error handling
 * Returns a standardized error message if the function throws
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: string = "API call"
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    console.error(`Error in ${context}:`, error);
    return { success: false, error: getApiErrorMessage(error) };
  }
} 