import React, { useState, useRef, useEffect } from "react";
import { Button, Tooltip } from 'antd';
import { CheckOutlined, PlusOutlined, DownOutlined } from '@ant-design/icons';
import { DataPoint } from "../types/data";
import ExampleItem from "./ExampleItem";
import styles from "../styles/ClusterGroup.module.css";
import Modal from "./Modal";
import * as d3 from "d3";

// Keep color configuration consistent with DualScatterPlot
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

interface ClusterGroupProps {
  clusterNumber: number;
  items: DataPoint[];
  selectedPoint: DataPoint | null;
  onPointSelect: (point: DataPoint) => void;
  suggestion?: string;
  onSaveSuggestion?: (clusterNumber: number, suggestion: string) => void;
  isSaved?: boolean;
  forceCollapsed?: number;
  previousAnnotations?: DataPoint[];
  onReannotate?: (point: DataPoint) => void;
  allClusterData?: DataPoint[]; // New: All cluster data for unified color mapping
}

const ClusterGroup: React.FC<ClusterGroupProps> = ({
  clusterNumber,
  items,
  selectedPoint,
  onPointSelect,
  suggestion,
  onSaveSuggestion,
  isSaved = false,
  forceCollapsed,
  previousAnnotations,
  onReannotate,
  allClusterData,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const clusterItemsRef = useRef<HTMLDivElement>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Convert number to corresponding letter (0->A, 1->B, 2->C, etc.)
  const getClusterLetter = (num: number): string => {
    // For clusters 0-7, use letters A-H
    if (num <= 7) {
      return String.fromCharCode(65 + num); // 65 is ASCII for 'A'
    }
    // For clusters 8 and above, use I, J, K, L, ... or Edge Case X format
    if (num <= 25) {
      return String.fromCharCode(65 + num); // I, J, K, L, ...
    }
    // For very high numbers, use Edge Case format
    return `Edge Case ${num}`;
  };

  // Get cluster color - corresponds to scatter plot colors below
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

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);
    
    // If collapsing manually, update lastForceCollapseTime to prevent auto-expansion
    if (!newExpandedState) {
      setLastForceCollapseTime(Date.now());
    }
  };

  // Check if content is scrollable on mount and resize
  useEffect(() => {
    const checkScrollable = () => {
      if (clusterItemsRef.current) {
        const { scrollHeight, clientHeight } = clusterItemsRef.current;
        setIsScrollable(scrollHeight > clientHeight);
      }
    };

    // Check initially
    checkScrollable();

    // Add resize listener
    window.addEventListener('resize', checkScrollable);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkScrollable);
    };
  }, [items, isExpanded]);

  // Handle scroll event to detect when user has started scrolling
  const handleScroll = () => {
    if (!hasScrolled && clusterItemsRef.current?.scrollTop && clusterItemsRef.current.scrollTop > 0) {
      setHasScrolled(true);
    }
  };

  // Scroll to selected item if it's in this cluster
  useEffect(() => {
    if (isExpanded && selectedPoint) {
      const selectedItem = items.find(item => 
        item.uid === selectedPoint.uid || 
        item.text_to_annotate === selectedPoint.text_to_annotate
      );
      
      if (selectedItem && clusterItemsRef.current) {
        // Use setTimeout to ensure the DOM has finished rendering after expansion
        setTimeout(() => {
          if (clusterItemsRef.current) {
            // Find the index of the selected item
            const index = items.findIndex(item => 
              item.uid === selectedPoint.uid || 
              item.text_to_annotate === selectedPoint.text_to_annotate
            );
            
            if (index !== -1) {
              // Try to get the actual element first for more accurate scrolling
              const selectedElement = clusterItemsRef.current.children[index + (suggestion ? 1 : 0)] as HTMLElement;
              
              if (selectedElement) {
                // Scroll to the actual element position
                selectedElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                  inline: 'nearest'
                });
              } else {
                // Fallback to approximate scroll position based on item height
                const itemHeight = 150; // Estimated average height of an item
                const suggestionHeight = suggestion ? 80 : 0; // Account for suggestion header
                clusterItemsRef.current.scrollTop = suggestionHeight + (index * itemHeight);
              }
            }
          }
        }, 150); // Small delay to ensure expansion animation completes
      }
    }
  }, [selectedPoint, isExpanded, items, suggestion]);

  // Track the last time forceCollapsed was triggered
  const [lastForceCollapseTime, setLastForceCollapseTime] = useState(0);

  // Auto-expand cluster if selectedPoint belongs to this cluster
  // But not if forceCollapsed was recently triggered (within 1 second)
  useEffect(() => {
    if (selectedPoint && !isExpanded) {
      const selectedItem = items.find(item => 
        item.uid === selectedPoint.uid || 
        item.text_to_annotate === selectedPoint.text_to_annotate
      );
      
      if (selectedItem) {
        // Check if forceCollapsed was recently triggered
        const now = Date.now();
        const timeSinceForceCollapse = now - lastForceCollapseTime;
        
        // Only auto-expand if forceCollapsed wasn't triggered recently (within 1 second)
        if (timeSinceForceCollapse > 1000) {
          setIsExpanded(true);
        }
      }
    }
  }, [selectedPoint, items, isExpanded, lastForceCollapseTime]);

  // Handler for save button click - now opens the confirmation modal instead
  const handleSaveButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suggestion && onSaveSuggestion && !isSaved) {
      setShowConfirmModal(true);
    }
  };

  // Handler for confirming the save in the modal
  const handleConfirmSave = () => {
    if (suggestion && onSaveSuggestion) {
      onSaveSuggestion(clusterNumber, suggestion);
      setShowConfirmModal(false);
    }
  };

  // Effect to handle the forceCollapsed prop
  useEffect(() => {
    if (forceCollapsed && forceCollapsed > 0) {
      setIsExpanded(false);
      setLastForceCollapseTime(forceCollapsed);
    }
  }, [forceCollapsed]);

  return (
    <div className={`${styles.clusterGroup} ${isExpanded ? styles.expanded : ''}`}>
      <div className={styles.clusterHeader} onClick={toggleExpand}>
        <div className={styles.headerLeft}>
          <div className={styles.headerInfo}>
            <span 
              className={styles.headerCluster}
              style={{
                backgroundColor: getClusterColor(clusterNumber),
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
                fontWeight: '700'
              }}
            >
              {getClusterLetter(clusterNumber)}
            </span>
            <span className={styles.headerCount}>{items.length} items</span>
          </div>
        </div>
        <Tooltip 
          title={isExpanded ? "Collapse cluster" : "Expand cluster"}
          placement="left"
          mouseEnterDelay={0.5}
          classNames={{ root: "compact-tooltip" }}
        >
          <div 
            className={styles.expandIcon}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(e);
            }}
          >
            <DownOutlined 
              className={`${styles.chevron} ${isExpanded ? styles.expanded : ""}`}
            />
          </div>
        </Tooltip>
      </div>
      {isExpanded && (
        <div 
          ref={clusterItemsRef}
          className={`${styles.clusterItems} ${isScrollable ? styles.scrollable : ''}`}
          onScroll={handleScroll}
        >
          {suggestion && (
            <div className={styles.clusterSuggestion}>
              <div className={styles.suggestionHeader}>
                <h4>Edge Case Handling Suggestion:</h4>
                {onSaveSuggestion && (
                  <Tooltip 
                    title={isSaved ? "Already saved to Edge Case Handling" : "Add to Edge Case Handling"}
                    placement="top"
                    mouseEnterDelay={0.5}
                    classNames={{ root: "compact-tooltip" }}
                  >
                    <Button 
                      type={isSaved ? "primary" : "default"}
                      shape="circle"
                      size="small"
                      icon={isSaved ? <CheckOutlined style={{ fontSize: '12px' }} /> : <PlusOutlined style={{ fontSize: '14px' }} />}
                      className={`${styles.saveButton} ${isSaved ? styles.saved : ''}`}
                      onClick={handleSaveButtonClick}
                      disabled={isSaved}
                      aria-label={isSaved ? "Saved to summary" : "Add to summary"}
                    />
                  </Tooltip>
                )}
              </div>
              <p>{suggestion}</p>
            </div>
          )}
          {items.map((item) => {
            const isSelected = selectedPoint?.uid 
              ? selectedPoint.uid === item.uid 
              : selectedPoint?.text_to_annotate === item.text_to_annotate;
            
            return (
              <ExampleItem
                key={item.uid || item.text_to_annotate}
                point={item}
                isSelected={isSelected}
                onClick={() => onPointSelect(item)}
                hideGuidelineImprovement={true}
                previousAnnotations={previousAnnotations}
                onReannotate={onReannotate}
              />
            );
          })}
          {isScrollable && !hasScrolled && (
            <div className={styles.scrollIndicator}>
              <span>Scroll for more</span>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Save Suggestion"
        onConfirm={handleConfirmSave}
        confirmText="Save"
      >
        <p>Are you sure you want to add this suggestion to the edge case handling?</p>
        <div className={styles.modalSuggestionPreview}>
          {suggestion}
        </div>
      </Modal>
    </div>
  );
};

export default ClusterGroup; 