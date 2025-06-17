import React, { useState, useRef, useEffect } from "react";
import { Button, Tooltip } from 'antd';
import { CheckOutlined, PlusOutlined, DownOutlined } from '@ant-design/icons';
import { DataPoint } from "../types/data";
import ExampleItem from "./ExampleItem";
import styles from "../styles/ClusterGroup.module.css";
import Modal from "./Modal";

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

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
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
        // Find the index of the selected item
        const index = items.findIndex(item => 
          item.uid === selectedPoint.uid || 
          item.text_to_annotate === selectedPoint.text_to_annotate
        );
        
        if (index !== -1) {
          // Approximate scroll position based on item height (adjust as needed)
          const itemHeight = 150; // Estimated average height of an item
          clusterItemsRef.current.scrollTop = index * itemHeight;
        }
      }
    }
  }, [selectedPoint, isExpanded, items]);

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
    }
  }, [forceCollapsed]);

  return (
    <div className={`${styles.clusterGroup} ${isExpanded ? styles.expanded : ''}`}>
      <div className={styles.clusterHeader} onClick={toggleExpand}>
        <div className={styles.headerLeft}>
          <div className={styles.headerInfo}>
            <span className={styles.headerCluster}>{getClusterLetter(clusterNumber)}</span>
            <span className={styles.headerCount}>{items.length} items</span>
          </div>
        </div>
        <Tooltip 
          title={isExpanded ? "Collapse cluster" : "Expand cluster"}
          placement="left"
          mouseEnterDelay={0.5}
          overlayClassName="compact-tooltip"
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
                    overlayClassName="compact-tooltip"
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