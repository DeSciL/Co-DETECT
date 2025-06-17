/// <reference types="vite/client" />

// Add declaration for JSON modules
declare module '*.json' {
  const value: Record<string, unknown> | unknown[];
  export default value;
}
