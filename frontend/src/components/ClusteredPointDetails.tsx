import React, { useRef, useState, useMemo, useCallback } from "react";
import { Button } from 'antd';
import { UpOutlined } from '@ant-design/icons';
import styles from "../styles/PointDetails.module.css";
import clusterSummaryStyles from "../styles/ClusterSummary.module.css";
import { DataPoint } from "../types/data";
import ClusterGroup from "./ClusterGroup";

interface ClusteredPointDetailsProps {
  point: DataPoint | null;
  data: DataPoint[];
  onPointSelect: (point: DataPoint) => void;
  suggestions?: Record<string, string>;
  onSaveSuggestion?: (clusterNumber: number, suggestion: string) => void;
  savedSuggestions?: Record<string, string>;
  previousAnnotations?: DataPoint[];
  onReannotate?: (point: DataPoint) => void;
  collapseAll?: number; // Timestamp trigger for collapsing all
}

const ClusteredPointDetails: React.FC<ClusteredPointDetailsProps> = ({
  point,
  data,
  onPointSelect,
  suggestions = {},
  onSaveSuggestion,
  savedSuggestions = {},
  previousAnnotations,
  onReannotate,
  collapseAll,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapseTimestamp, setCollapseTimestamp] = useState<number>(0);

  // Memoized sorting and clustering operations
  const clusteredData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return {};
    }

    // Sort data by cluster by default
    const sortedData = [...data].sort((a, b) => {
      // Sort by new_cluster_id
      return (a.new_cluster_id || 0) - (b.new_cluster_id || 0);
    });

    // Group the sorted data by cluster
    const grouped = sortedData.reduce<Record<number, DataPoint[]>>(
      (acc, item) => {
        // Use new_cluster_id as the primary cluster field
        const clusterNum = item.new_cluster_id || 0;
        // Keep all cluster numbers separate - no more grouping into "Others"
        const targetCluster = clusterNum;
        if (!acc[targetCluster]) {
          acc[targetCluster] = [];
        }
        acc[targetCluster].push(item);
        return acc;
      },
      {}
    );

    return grouped;
  }, [data]);

  // Memoized callback for collapse all
  const handleCollapseAll = useCallback(() => {
    setCollapseTimestamp(Date.now());
  }, []);

  // React to external collapse trigger
  React.useEffect(() => {
    if (collapseAll && collapseAll > collapseTimestamp) {
      setCollapseTimestamp(collapseAll);
    }
  }, [collapseAll, collapseTimestamp]);

  // Memoized cluster entries to avoid recalculating
  const clusterEntries = useMemo(() => {
    return Object.entries(clusteredData);
  }, [clusteredData]);

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div
        className={clusterSummaryStyles.emptyState}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          padding: '0',
          height: '100%',
        }}
      >
        <p>No Suggested Edge Cases</p>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {/* 隐藏按钮，但保留其功能，作为Dashboard中按钮的触发目标 */}
      <Button 
        type="default"
        icon={<UpOutlined />}
        className="improvementCollapseButton"
        onClick={handleCollapseAll}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <div className={styles.list}>
        {clusterEntries.length > 20 ? (
          // For large numbers of clusters, show only first 15 clusters
          <>
            {clusterEntries.slice(0, 15).map(([clusterNum, items]) => {
              const numericClusterNum = parseInt(clusterNum);
              const isSaved = savedSuggestions && Object.prototype.hasOwnProperty.call(savedSuggestions, numericClusterNum);
              
              // Map the cluster number to suggestion key
              const firstItem = items[0];
              let suggestionKey = `edge_case_${clusterNum}`;
              
              // If the first item has raw_annotations, try to extract the edge_case_id from it
              if (firstItem?.raw_annotations) {
                try {
                  const rawData = JSON.parse(firstItem.raw_annotations);
                  if (rawData.edge_case_id !== undefined) {
                    suggestionKey = `edge_case_${Math.floor(rawData.edge_case_id)}`;
                  }
                } catch {
                  // If parsing fails, continue with default logic
                }
              }
              
              // Also check if there's an edge_case_id field directly on the item
              const itemWithEdgeCaseId = firstItem as DataPoint & { edge_case_id?: number };
              if (firstItem && typeof itemWithEdgeCaseId.edge_case_id === 'number') {
                suggestionKey = `edge_case_${Math.floor(itemWithEdgeCaseId.edge_case_id)}`;
              }
              
              const suggestion = suggestions[suggestionKey] || '';
              
              return (
                <div id={`cluster-${clusterNum}`} key={`cluster-${clusterNum}`}>
                  <ClusterGroup
                    clusterNumber={numericClusterNum}
                    items={items}
                    selectedPoint={point}
                    onPointSelect={onPointSelect}
                    suggestion={suggestion}
                    onSaveSuggestion={onSaveSuggestion}
                    isSaved={isSaved}
                    forceCollapsed={collapseTimestamp}
                    previousAnnotations={previousAnnotations}
                    onReannotate={onReannotate}
                  />
                </div>
              );
            })}
            {clusterEntries.length > 15 && (
              <div className={styles.loadMoreContainer}>
                <p className={styles.loadMoreText}>
                  Showing first 15 clusters out of {clusterEntries.length} total clusters.
                  Scroll up to see all improvement suggestions or use filters to narrow down results.
                </p>
              </div>
            )}
          </>
        ) : (
          // For smaller numbers of clusters, render all
          clusterEntries.map(([clusterNum, items]) => {
            const numericClusterNum = parseInt(clusterNum);
            const isSaved = savedSuggestions && Object.prototype.hasOwnProperty.call(savedSuggestions, numericClusterNum);
            
            // Map the cluster number to suggestion key
            const firstItem = items[0];
            let suggestionKey = `edge_case_${clusterNum}`;
            
            // If the first item has raw_annotations, try to extract the edge_case_id from it
            if (firstItem?.raw_annotations) {
              try {
                const rawData = JSON.parse(firstItem.raw_annotations);
                if (rawData.edge_case_id !== undefined) {
                  suggestionKey = `edge_case_${Math.floor(rawData.edge_case_id)}`;
                }
              } catch {
                // If parsing fails, continue with default logic
              }
            }
            
            // Also check if there's an edge_case_id field directly on the item
            const itemWithEdgeCaseId = firstItem as DataPoint & { edge_case_id?: number };
            if (firstItem && typeof itemWithEdgeCaseId.edge_case_id === 'number') {
              suggestionKey = `edge_case_${Math.floor(itemWithEdgeCaseId.edge_case_id)}`;
            }
            
            const suggestion = suggestions[suggestionKey] || '';
            
            return (
              <div id={`cluster-${clusterNum}`} key={`cluster-${clusterNum}`}>
                <ClusterGroup
                  clusterNumber={numericClusterNum}
                  items={items}
                  selectedPoint={point}
                  onPointSelect={onPointSelect}
                  suggestion={suggestion}
                  onSaveSuggestion={onSaveSuggestion}
                  isSaved={isSaved}
                  forceCollapsed={collapseTimestamp}
                  previousAnnotations={previousAnnotations}
                  onReannotate={onReannotate}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ClusteredPointDetails;