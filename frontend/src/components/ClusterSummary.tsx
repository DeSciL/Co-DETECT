import React from "react";
import { Tooltip } from 'antd';
import styles from "../styles/ClusterSummary.module.css";

interface ClusterSummaryProps {
  savedSuggestions: Record<number, string>;
  onRemoveSuggestion?: (clusterNumber: number) => void;
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

  const handleRemove = (clusterNum: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    if (onRemoveSuggestion) {
      onRemoveSuggestion(clusterNum);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.summaryList}>
        {Object.entries(savedSuggestions).map(([clusterNum, suggestion]) => {
          const numericCluster = parseInt(clusterNum);
          
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
                      onClick={(e) => handleRemove(numericCluster, e)}
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
