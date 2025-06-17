// Read API URL from environment variables, if not exists use default local URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Other API related configuration can be added here 