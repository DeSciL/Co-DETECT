import React from "react";
import { Tooltip } from 'antd';
import styles from "../styles/ClusterSummary.module.css";

interface ClusterSummaryProps {
  savedSuggestions: Record<string, string>;
  onRemoveSuggestion?: (clusterKey: string) => void;
}

const ClusterSummary: React.FC<ClusterSummaryProps> = ({
  savedSuggestions,
  onRemoveSuggestion,
}) => {
  // Convert number to corresponding letter (0->A, 1->B, 2->C, etc.)
  const getClusterLetter = (num: number): string => {
    if (num >= 8) return "Others";
    return String.fromCharCode(65 + num); // 65 is ASCII for 'A'
  };

  // If no saved suggestions available
  if (Object.keys(savedSuggestions).length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>No edge case handling suggestion available.</p>
        </div>
      </div>
    );
  }

  const handleRemove = (clusterKey: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    if (onRemoveSuggestion) {
      onRemoveSuggestion(clusterKey);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.summaryList}>
        {Object.entries(savedSuggestions).map(([clusterNum, suggestion]) => {
          // Extract numeric part from cluster key (e.g., "edge_case_0" -> 0)
          const numericMatch = clusterNum.match(/\d+/);
          const numericCluster = numericMatch ? parseInt(numericMatch[0]) : 0;
          
          return (
            <div
              key={`summary-cluster-${clusterNum}`}
              className={styles.clusterSummary}
            >
              <div className={styles.clusterHeader}>
                <span className={styles.clusterBadge}>
                  {getClusterLetter(numericCluster)}
                </span>
                {onRemoveSuggestion && (
                  <Tooltip 
                    title="Remove from summary" 
                    placement="top"
                    mouseEnterDelay={0.5}
                    overlayClassName="compact-tooltip"
                  >
                    <button
                      className={styles.removeButton}
                      onClick={(e) => handleRemove(clusterNum, e)}
                      aria-label="Remove from summary"
                    >
                      ×
                    </button>
                  </Tooltip>
                )}
              </div>
              <div className={styles.improvementText}>
                <p>{suggestion}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClusterSummary;
