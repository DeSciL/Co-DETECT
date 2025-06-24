import React, { useState } from "react";
import { Tooltip } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import styles from "../styles/ClusterSummary.module.css";

interface ClusterSummaryProps {
  savedSuggestions: Record<string, string>;
  onRemoveSuggestion?: (clusterKey: string) => void;
  onEditSuggestion?: (clusterKey: string, newSuggestion: string) => void;
}

const ClusterSummary: React.FC<ClusterSummaryProps> = ({
  savedSuggestions,
  onRemoveSuggestion,
  onEditSuggestion,
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

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
                <span className={styles.clusterBadge}>
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
