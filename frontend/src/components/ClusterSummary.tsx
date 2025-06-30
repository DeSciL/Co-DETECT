import React, { useState } from "react";
import { Tooltip } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import styles from "../styles/ClusterSummary.module.css";
import { DataPoint } from "../types/data";
import * as d3 from "d3";

// Keep color configuration consistent with ClusterGroup and DualScatterPlot
const PLOT_COLORS = {
  BOTTOM: [
    "#8dd3c7",
    "#ffffb3", 
    "#bebada",
    "#fb8072",
    "#80b1d3",
    "#fdb462",
    "#b3de69",
    "#fccde5",
    "#d9d9d9",
    "#bc80bd",
  ]
};

interface ClusterSummaryProps {
  savedSuggestions: Record<string, string>;
  onRemoveSuggestion?: (clusterKey: string) => void;
  onEditSuggestion?: (clusterKey: string, newSuggestion: string) => void;
  allClusterData?: DataPoint[]; // New: All cluster data for unified color mapping
}

const ClusterSummary: React.FC<ClusterSummaryProps> = ({
  savedSuggestions,
  onRemoveSuggestion,
  onEditSuggestion,
  allClusterData,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Convert number to corresponding letter (0->A, 1->B, 2->C, etc.)
  const getClusterLetter = (num: number): string => {
    if (num >= 8) return "Others";
    return String.fromCharCode(65 + num); // 65 is ASCII for 'A'
  };

  // Get cluster color - corresponds to ClusterGroup and scatter plot colors below
  const getClusterColor = (clusterNum: number): string => {
    // If all cluster data is available, use actual cluster IDs to create domain, ensuring consistency with scatter plot
    if (allClusterData && Array.isArray(allClusterData)) {
      const allClusterIds = new Set<string>();
      allClusterData.forEach(d => allClusterIds.add(String(d.new_cluster_id)));
      const sortedClusterIds = Array.from(allClusterIds).sort();
      
      const colorScale = d3
        .scaleOrdinal<string, string>()
        .domain(sortedClusterIds)
        .range(PLOT_COLORS.BOTTOM);
      
      return colorScale(String(clusterNum));
    }
    
    // Fall back to original logic
    const colorScale = d3
      .scaleOrdinal<string, string>()
      .domain(Array.from({length: 9}, (_, i) => String(i))) // 0-8
      .range(PLOT_COLORS.BOTTOM);
    
    return colorScale(String(clusterNum));
  };

  // If no saved suggestions available
  if (Object.keys(savedSuggestions).length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>No edge case handling suggestion available</p>
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

  const handleEdit = (clusterKey: string, currentValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingKey(clusterKey);
    setEditValue(currentValue);
  };

  const handleSaveEdit = (clusterKey: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (onEditSuggestion && editValue.trim() !== "") {
      onEditSuggestion(clusterKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue("");
  };

  const handleCancelEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingKey(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, clusterKey: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit(clusterKey, e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit(e);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.summaryList}>
        {Object.entries(savedSuggestions).map(([clusterNum, suggestion]) => {
          // Extract numeric part from cluster key (e.g., "edge_case_0" -> 0)
          const numericMatch = clusterNum.match(/\d+/);
          const numericCluster = numericMatch ? parseInt(numericMatch[0]) : 0;
          const isEditing = editingKey === clusterNum;
          
          return (
            <div
              key={`summary-cluster-${clusterNum}`}
              className={styles.clusterSummary}
            >
              <div className={styles.clusterHeader}>
                <span 
                  className={styles.clusterBadge} 
                  style={{ 
                    backgroundColor: getClusterColor(numericCluster),
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                    fontWeight: '700'
                  }}
                >
                  {getClusterLetter(numericCluster)}
                </span>
                <div className={styles.headerActions}>
                  {!isEditing ? (
                    <>
                      {onEditSuggestion && (
                        <Tooltip 
                          title="Edit suggestion" 
                          placement="top"
                          mouseEnterDelay={0.5}
                          classNames={{ root: "compact-tooltip" }}
                        >
                          <button
                            className={styles.editButton}
                            onClick={(e) => handleEdit(clusterNum, suggestion, e)}
                            aria-label="Edit suggestion"
                          >
                            <EditOutlined style={{ fontSize: '12px' }} />
                          </button>
                        </Tooltip>
                      )}
                      {onRemoveSuggestion && (
                        <Tooltip 
                          title="Remove from summary" 
                          placement="top"
                          mouseEnterDelay={0.5}
                          classNames={{ root: "compact-tooltip" }}
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
                    </>
                  ) : (
                    <div className={styles.editActions}>
                      <Tooltip 
                        title="Save changes (Enter)" 
                        placement="top"
                        mouseEnterDelay={0.5}
                        classNames={{ root: "compact-tooltip" }}
                      >
                        <button
                          className={styles.saveButton}
                          onClick={(e) => handleSaveEdit(clusterNum, e)}
                          aria-label="Save changes"
                          disabled={editValue.trim() === ""}
                        >
                          <CheckOutlined style={{ fontSize: '12px' }} />
                        </button>
                      </Tooltip>
                      <Tooltip 
                        title="Cancel editing (Esc)" 
                        placement="top"
                        mouseEnterDelay={0.5}
                        classNames={{ root: "compact-tooltip" }}
                      >  
                        <button
                          className={styles.cancelButton}
                          onClick={handleCancelEdit}
                          aria-label="Cancel editing"
                        >
                          <CloseOutlined style={{ fontSize: '12px' }} />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.improvementText}>
                {isEditing ? (
                  <textarea
                    className={styles.editTextarea}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, clusterNum)}
                    autoFocus
                    rows={3}
                    placeholder="Enter your edge case handling suggestion..."
                  />
                ) : (
                  <p>{suggestion}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClusterSummary;
