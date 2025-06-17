import { useContext } from 'react';
import { DataContext } from '../contexts/DataContext';

// Custom hook to use the context
export function useDataContext() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
} 