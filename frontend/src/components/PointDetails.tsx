import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Button, Input } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import styles from "../styles/PointDetails.module.css";
import { DataPoint } from "../types/data";
import ExampleItem from "./ExampleItem";
import Modal from "./Modal";

interface PointDetailsProps {
  point: DataPoint | null;
  data: DataPoint[];
  onPointSelect: (point: DataPoint) => void;
  onAddExample?: (example: Partial<DataPoint>) => void;
  previousAnnotations?: DataPoint[];
  onReannotate?: (point: DataPoint) => void;
  showAnnotationColor?: boolean;
  colorScheme?: string[];
}

type SortOption = "new" | "confidence" | "confidence_increase" | "confidence_decrease" | "class" | "alphabetical";
type SortDirection = "asc" | "desc";

const PointDetails: React.FC<PointDetailsProps> = ({ 
  point, 
  data, 
  onPointSelect, 
  onAddExample,
  previousAnnotations,
  onReannotate,
  showAnnotationColor = false,
  colorScheme
}) => {

  const selectedItemRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>("new");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExample, setNewExample] = useState<string>("");
  
  // Lazy loading states
  const [itemsToShow, setItemsToShow] = useState(50); // Start with 50 items
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Search/filter state
  const [searchTerm, setSearchTerm] = useState("");

  // Pre-compute confidence changes to avoid repeated calculations during sorting
  const confidenceChangesMap = useMemo(() => {
    if (!previousAnnotations || previousAnnotations.length === 0 || !Array.isArray(data)) {
      return new Map<string, number>();
    }

    // Create a map for both UID and text matching
    const prevMapByUid = new Map<string, number>();
    const prevMapByText = new Map<string, number>();
    
    previousAnnotations.forEach(prev => {
      const prevConf = typeof prev.confidence === 'string' ? parseFloat(prev.confidence) : (prev.confidence || 0);
      
      if (prev.uid) {
        prevMapByUid.set(prev.uid, prevConf);
      }
      if (prev.text_to_annotate) {
        prevMapByText.set(prev.text_to_annotate, prevConf);
      }
    });

    const changesMap = new Map<string, number>();
    data.forEach(item => {
      const currentConf = typeof item.confidence === 'string' ? parseFloat(item.confidence) : (item.confidence || 0);
      let prevConf: number | undefined;
      
      // Try UID matching first
      if (item.uid && prevMapByUid.has(item.uid)) {
        prevConf = prevMapByUid.get(item.uid);
      }
      // If UID matching fails, try text matching
      else if (item.text_to_annotate && prevMapByText.has(item.text_to_annotate)) {
        prevConf = prevMapByText.get(item.text_to_annotate);
      }
      
      // Store the change if we found a match
      if (prevConf !== undefined && item.uid) {
        const change = currentConf - prevConf;
        changesMap.set(item.uid, change);
      }
    });

    return changesMap;
  }, [data, previousAnnotations]);

  // Optimized sorting with memoization
  const sortedAndFilteredData = useMemo(() => {
    if (!Array.isArray(data)) {
      return [];
    }

    // First apply search filter
    let filteredData = data;
    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredData = data.filter(item => 
        item.text_to_annotate?.toLowerCase().includes(lowerSearchTerm) ||
        item.analyses?.toLowerCase().includes(lowerSearchTerm) ||
        item.raw_annotations?.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Then sort the filtered data
    return [...filteredData].sort((a, b) => {
      let compareResult = 0;
      
      switch (sortOption) {
        case "new": {
          // Prioritize re-annotated items first, then by confidence
          const aIsNew = a.isReannotated || false;
          const bIsNew = b.isReannotated || false;
          if (aIsNew !== bIsNew) {
            return aIsNew ? -1 : 1;
          }
          // If both are new or both are old, sort by confidence as secondary
          compareResult = (b.confidence || 0) - (a.confidence || 0);
          break;
        }
        case "confidence":
          compareResult = (a.confidence || 0) - (b.confidence || 0);
          break;
        case "confidence_increase":
        case "confidence_decrease": {
          // Use pre-computed confidence changes
          const aChange = (a.uid && confidenceChangesMap.has(a.uid)) ? confidenceChangesMap.get(a.uid)! : 0;
          const bChange = (b.uid && confidenceChangesMap.has(b.uid)) ? confidenceChangesMap.get(b.uid)! : 0;
          
          // Categorize items by gained/lost
          const isTargetCategory = sortOption === "confidence_increase" 
            ? (change: number) => change > 0
            : (change: number) => change < 0;
          
          const aIsTarget = isTargetCategory(aChange);
          const bIsTarget = isTargetCategory(bChange);
          
          // First priority: put relevant category (gained/lost) first
          if (aIsTarget !== bIsTarget) {
            return aIsTarget ? -1 : 1;
          } else if (aIsTarget && bIsTarget) {
            // Both are in the target category, sort by change value considering direction
            if (sortOption === "confidence_increase") {
              // For gained: sort by positive change values
              compareResult = aChange - bChange; // This will be reversed by sortDirection logic below
            } else {
              // For lost: sort by negative change values (more negative = larger loss)
              compareResult = bChange - aChange; // This will be reversed by sortDirection logic below
            }
          } else {
            // Both are in 'other' category, sort by absolute change value
            compareResult = Math.abs(bChange) - Math.abs(aChange);
          }
          break;
        }
        case "class": {
          // Handle different annotation values: -1 (unclear), 0 (not hate), 1 (hate)
          const getClassValue = (annotation: number | string | undefined) => {
            if (annotation === -1 || annotation === "-1") return -1;
            if (annotation === 1 || annotation === "1") return 1;
            return 0; // Default to 0 for annotation === 0 or "0"
          };
          const aClass = getClassValue(a.annotation);
          const bClass = getClassValue(b.annotation);
          compareResult = aClass - bClass;
          break;
        }
        case "alphabetical":
          compareResult = (a.text_to_annotate || "").localeCompare(b.text_to_annotate || "");
          break;
      }
      
      return sortDirection === "asc" ? compareResult : -compareResult;
    });
  }, [data, sortOption, sortDirection, confidenceChangesMap, searchTerm]);

  // Get currently displayed data
  const displayData = useMemo(() => {
    const currentData = sortedAndFilteredData.slice(0, itemsToShow);
    
    // Always include selected item if it's not in the current view
    if (point && !currentData.find(item => 
      item.uid === point.uid || item.text_to_annotate === point.text_to_annotate
    )) {
      const selectedItem = sortedAndFilteredData.find(item => 
        item.uid === point.uid || item.text_to_annotate === point.text_to_annotate
      );
      if (selectedItem) {
        return [...currentData, selectedItem];
      }
    }
    
    return currentData;
  }, [sortedAndFilteredData, itemsToShow, point]);

  // Check if there are any re-annotated items
  const hasReannotatedItems = useMemo(() => {
    return Array.isArray(data) && data.some(item => item.isReannotated === true);
  }, [data]);

  // Lazy loading function
  const loadMoreItems = useCallback(async () => {
    setIsLoadingMore(true);
    
    // Simulate network delay for smooth UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    setItemsToShow(prev => Math.min(prev + 50, sortedAndFilteredData.length));
    setIsLoadingMore(false);
  }, [sortedAndFilteredData.length]);

  // Reset items to show when sort or search changes
  useEffect(() => {
    setItemsToShow(50);
  }, [sortOption, sortDirection, searchTerm]);

  // Reset sort option if "new" is selected but no re-annotated items exist
  useEffect(() => {
    if (!hasReannotatedItems && sortOption === "new") {
      setSortOption("confidence");
      setSortDirection("asc");
    }
  }, [hasReannotatedItems, sortOption]);

  // Memoized callback for sort change
  const handleSortChange = useCallback((newSortOption: SortOption) => {
    if (newSortOption === sortOption) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortOption(newSortOption);
      setSortDirection("asc");
    }
    // Scroll the list back to top
    const listElement = document.querySelector(`.${styles.list}`);
    if (listElement) {
      listElement.scrollTop = 0;
    }
  }, [sortOption, sortDirection]);

  // Memoized search handler
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
  }, []);

  // Memoized calculations for averages and statistics
  const statistics = useMemo(() => {
    const statsData = searchTerm ? sortedAndFilteredData : (Array.isArray(data) ? data : []);
    
    // Separate data into edge cases and others
    const edgeCases = statsData.filter(item => item.new_edge_case === true);
    const others = statsData.filter(item => item.new_edge_case !== true);
    
    // Calculate average confidence for edge cases
    const averageConfidenceEdgeCases = (() => {
      if (!edgeCases || edgeCases.length === 0) return 0;
      
      const validConfidences = edgeCases
        .map(item => {
          const conf = item.confidence;
          const numConf = typeof conf === 'string' ? parseFloat(conf) : Number(conf);
          return !isNaN(numConf) && isFinite(numConf) ? numConf : 0;
        })
        .filter(conf => conf >= 0 && conf <= 100);
      
      if (validConfidences.length === 0) return 0;
      
      const sum = validConfidences.reduce((acc, conf) => acc + conf, 0);
      const avg = sum / validConfidences.length;
      
      return !isNaN(avg) && isFinite(avg) ? avg : 0;
    })();

    // Calculate average confidence for others
    const averageConfidenceOthers = (() => {
      if (!others || others.length === 0) return 0;
      
      const validConfidences = others
        .map(item => {
          const conf = item.confidence;
          const numConf = typeof conf === 'string' ? parseFloat(conf) : Number(conf);
          return !isNaN(numConf) && isFinite(numConf) ? numConf : 0;
        })
        .filter(conf => conf >= 0 && conf <= 100);
      
      if (validConfidences.length === 0) return 0;
      
      const sum = validConfidences.reduce((acc, conf) => acc + conf, 0);
      const avg = sum / validConfidences.length;
      
      return !isNaN(avg) && isFinite(avg) ? avg : 0;
    })();

    // Calculate confidence differences based on the SAME data points that were edge / others in the previous round
    // Improved matching function that tries both uid and text matching
    const findMatchingItems = (previousItems: DataPoint[], currentData: DataPoint[]) => {
      const matches: DataPoint[] = [];
      
      for (const prevItem of previousItems) {
        // First try UID matching
        let match = currentData.find(currItem => 
          prevItem.uid && currItem.uid && prevItem.uid === currItem.uid
        );
        
        // If UID matching fails, try text matching
        if (!match) {
          match = currentData.find(currItem => 
            prevItem.text_to_annotate === currItem.text_to_annotate
          );
        }
        
        if (match) {
          matches.push(match);
        }
      }
      
      return matches;
    };

    // Confidence change for previous edge cases
    const confidenceDifferenceEdgeCases = (() => {
      if (!previousAnnotations || previousAnnotations.length === 0) return null;
      // Points that were edge cases in the previous iteration
      const prevEdgeCases = previousAnnotations.filter(item => item.new_edge_case === true);
      if (prevEdgeCases.length === 0) return null;

      // Find current annotations for these exact points using improved matching
      const currForPrevEdge = findMatchingItems(prevEdgeCases, Array.isArray(data) ? data : []);
      if (currForPrevEdge.length === 0) {
        return null;
      }

      // Helper to extract numeric confidence safely
      const toNum = (conf: number | string | undefined): number => {
        const num = typeof conf === 'string' ? parseFloat(conf) : Number(conf);
        return !isNaN(num) && isFinite(num) ? num : NaN;
      };

      const avgPrev = (() => {
        const nums = prevEdgeCases.map(item => toNum(item.confidence)).filter(n => !isNaN(n) && n >= 0 && n <= 100);
        if (nums.length === 0) return null;
        return nums.reduce((acc, n) => acc + n, 0) / nums.length;
      })();

      const avgCurr = (() => {
        const nums = currForPrevEdge.map(item => toNum(item.confidence)).filter(n => !isNaN(n) && n >= 0 && n <= 100);
        if (nums.length === 0) return null;
        return nums.reduce((acc, n) => acc + n, 0) / nums.length;
      })();

      if (avgPrev === null || avgCurr === null) return null;
      
      return avgCurr - avgPrev;
    })();

    // Confidence change for previous "others" (non-edge cases)
    const confidenceDifferenceOthers = (() => {
      if (!previousAnnotations || previousAnnotations.length === 0) return null;
      const prevOthers = previousAnnotations.filter(item => item.new_edge_case !== true);
      if (prevOthers.length === 0) return null;

      // Find current annotations for these exact points using improved matching
      const currForPrevOthers = findMatchingItems(prevOthers, Array.isArray(data) ? data : []);
      if (currForPrevOthers.length === 0) {
        return null;
      }

      const toNum = (conf: number | string | undefined): number => {
        const num = typeof conf === 'string' ? parseFloat(conf) : Number(conf);
        return !isNaN(num) && isFinite(num) ? num : NaN;
      };

      const avgPrev = (() => {
        const nums = prevOthers.map(item => toNum(item.confidence)).filter(n => !isNaN(n) && n >= 0 && n <= 100);
        if (nums.length === 0) return null;
        return nums.reduce((acc, n) => acc + n, 0) / nums.length;
      })();

      const avgCurr = (() => {
        const nums = currForPrevOthers.map(item => toNum(item.confidence)).filter(n => !isNaN(n) && n >= 0 && n <= 100);
        if (nums.length === 0) return null;
        return nums.reduce((acc, n) => acc + n, 0) / nums.length;
      })();

      if (avgPrev === null || avgCurr === null) return null;
      
      return avgCurr - avgPrev;
    })();

    // Calculate edge case count
    const edgeCaseCount = statsData.filter(item => item.new_edge_case === true).length;

    // Calculate previous edge case count for comparison
    const previousEdgeCaseCount = (() => {
      if (!previousAnnotations || previousAnnotations.length === 0) return null;
      return previousAnnotations.filter(item => item.new_edge_case === true).length;
    })();

    const edgeCaseCountDifference = previousEdgeCaseCount !== null 
      ? edgeCaseCount - previousEdgeCaseCount 
      : null;

    return {
      averageConfidenceEdgeCases,
      averageConfidenceOthers,
      confidenceDifferenceEdgeCases,
      confidenceDifferenceOthers,
      edgeCaseCount,
      edgeCaseCountDifference,
      totalCount: statsData.length,
      filteredCount: sortedAndFilteredData.length
    };
  }, [data, sortedAndFilteredData, previousAnnotations, searchTerm]);

  useEffect(() => {
    if (point && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [point]);

  const handleAddExample = () => {
    if (newExample.trim() && onAddExample) {
      onAddExample({
        text_to_annotate: newExample.trim()
      });
      setNewExample("");
      setShowAddModal(false);
    }
  };

  // Calculate all annotation values for unified color mapping
  const allAnnotationValues = useMemo(() => {
    if (!showAnnotationColor || !Array.isArray(data)) return [];
    
    const annotationSet = new Set<string>();
    data.forEach(item => annotationSet.add(String(item.annotation)));
    return Array.from(annotationSet).sort();
  }, [data, showAnnotationColor]);

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyState}>No examples available</p>
      </div>
    );
  }

  const getSortIndicator = (option: SortOption) => {
    if (sortOption === option) {
      return (
        <span className={styles.sortIndicator}>
          {sortDirection === "asc" ? "↑" : "↓"}
        </span>
      );
    }
    return null;
  };

  return (
    <div className={styles.container}>
              {/* Hide button but keep its functionality, only as trigger target for Dashboard buttons */}
      {onAddExample && (
        <Button 
          type="primary"
          icon={<PlusOutlined />}
          className="pointDetailsAddButton"
          onClick={() => setShowAddModal(true)}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      )}
      <div className={styles.sortContainer}>
        {/* Search Section */}
        <div className={styles.searchSection}>
          <Input
            placeholder="Search examples..."
            value={searchTerm}
            onChange={handleSearchChange}
            prefix={<SearchOutlined />}
            allowClear
            onClear={handleClearSearch}
            className={styles.searchInput}
          />
          {searchTerm && (
            <span className={styles.searchResults}>
              {statistics.filteredCount} of {statistics.totalCount} items
            </span>
          )}
        </div>
        
        <div className={styles.sortSection}>
          <span className={styles.sortLabel}>Sort by:</span>
          <div className={styles.sortOptions}>
            {hasReannotatedItems && (
              <button 
                className={`${styles.sortButton} ${sortOption === "new" ? styles.active : ""}`}
                onClick={() => handleSortChange("new")}
              >
                New {getSortIndicator("new")}
              </button>
            )}
            <button 
              className={`${styles.sortButton} ${sortOption === "confidence" ? styles.active : ""}`}
              onClick={() => handleSortChange("confidence")}
            >
              Confidence {getSortIndicator("confidence")}
            </button>
            {previousAnnotations && previousAnnotations.length > 0 && (
              <>
                <button 
                  className={`${styles.sortButton} ${sortOption === "confidence_increase" ? styles.active : ""}`}
                  onClick={() => handleSortChange("confidence_increase")}
                >
                  ↗️ Gained {getSortIndicator("confidence_increase")}
                </button>
                <button 
                  className={`${styles.sortButton} ${sortOption === "confidence_decrease" ? styles.active : ""}`}
                  onClick={() => handleSortChange("confidence_decrease")}
                >
                  ↘️ Lost {getSortIndicator("confidence_decrease")}
                </button>
              </>
            )}
            <button 
              className={`${styles.sortButton} ${sortOption === "class" ? styles.active : ""}`}
              onClick={() => handleSortChange("class")}
            >
              Class {getSortIndicator("class")}
            </button>
            <button 
              className={`${styles.sortButton} ${sortOption === "alphabetical" ? styles.active : ""}`}
              onClick={() => handleSortChange("alphabetical")}
            >
              A-Z {getSortIndicator("alphabetical")}
            </button>
          </div>
        </div>
        <div className={styles.avgConfidenceSection}>
          <div className={styles.avgConfidenceItem}>
            <span className={styles.sortLabel}>
              Confidence change of previous edge cases:
            </span>
            <div className={styles.avgConfidenceValue}>
              {previousAnnotations && previousAnnotations.length > 0 && statistics.confidenceDifferenceEdgeCases !== null ? (
                <span className={`${styles.confidenceChange} ${
                  statistics.confidenceDifferenceEdgeCases > 0 ? styles.confidenceIncrease : 
                  statistics.confidenceDifferenceEdgeCases < 0 ? styles.confidenceDecrease : styles.confidenceNoChange
                }`}>
                  {statistics.confidenceDifferenceEdgeCases > 0 ? '↑' : statistics.confidenceDifferenceEdgeCases < 0 ? '↓' : '='} 
                  {Math.abs(statistics.confidenceDifferenceEdgeCases).toFixed(1)}%
                </span>
              ) : (
                <span>-</span>
              )}
            </div>
          </div>
          <div className={styles.avgConfidenceItem}>
            <span className={styles.sortLabel}>
              Confidence change of previous non-edge cases:
            </span>
            <div className={styles.avgConfidenceValue}>
              {previousAnnotations && previousAnnotations.length > 0 && statistics.confidenceDifferenceOthers !== null ? (
                <span className={`${styles.confidenceChange} ${
                  statistics.confidenceDifferenceOthers > 0 ? styles.confidenceIncrease : 
                  statistics.confidenceDifferenceOthers < 0 ? styles.confidenceDecrease : styles.confidenceNoChange
                }`}>
                  {statistics.confidenceDifferenceOthers > 0 ? '↑' : statistics.confidenceDifferenceOthers < 0 ? '↓' : '='} 
                  {Math.abs(statistics.confidenceDifferenceOthers).toFixed(1)}%
                </span>
              ) : (
                <span>-</span>
              )}
            </div>
          </div>
          <div className={styles.avgConfidenceItem}>
            <span className={styles.sortLabel}>
              Total Edge Case Count:
            </span>
            <div className={styles.avgConfidenceValue}>
              {statistics.edgeCaseCount}
              {previousAnnotations && previousAnnotations.length > 0 && statistics.edgeCaseCountDifference !== null && (
                <span className={`${styles.confidenceChange} ${
                  statistics.edgeCaseCountDifference > 0 ? styles.confidenceDecrease : 
                  statistics.edgeCaseCountDifference < 0 ? styles.confidenceIncrease : styles.confidenceNoChange
                }`}>
                  {statistics.edgeCaseCountDifference > 0 ? '↑' : statistics.edgeCaseCountDifference < 0 ? '↓' : '='} 
                  {Math.abs(statistics.edgeCaseCountDifference)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.list}>
        {displayData.map((item) => {
          const itemKey = item.uid || item.text_to_annotate;
          const isSelected = point?.uid 
            ? point.uid === item.uid 
            : point?.text_to_annotate === item.text_to_annotate;
          
          return (
            <div 
              key={itemKey}
              ref={isSelected ? selectedItemRef : null}
            >
              <ExampleItem
                point={item}
                isSelected={isSelected}
                onClick={() => onPointSelect(item)}
                previousAnnotations={previousAnnotations}
                onReannotate={onReannotate}
                showAnnotationColor={showAnnotationColor}
                colorScheme={colorScheme}
                allAnnotationValues={allAnnotationValues}
              />
            </div>
          );
        })}
        
        {/* Load More Section */}
        {sortedAndFilteredData.length > itemsToShow && (
          <div className={styles.loadMoreContainer}>
            <p className={styles.loadMoreText}>
              Showing {displayData.length} of {sortedAndFilteredData.length} items
              {searchTerm && ` (filtered from ${statistics.totalCount} total)`}
            </p>
            <Button 
              type="primary" 
              ghost
              onClick={loadMoreItems}
              loading={isLoadingMore}
              className={styles.loadMoreButton}
            >
              {isLoadingMore ? 'Loading...' : `Load More (+${Math.min(50, sortedAndFilteredData.length - itemsToShow)} items)`}
            </Button>
          </div>
        )}
        
        {/* No more items message */}
        {sortedAndFilteredData.length > 0 && sortedAndFilteredData.length <= itemsToShow && itemsToShow > 50 && (
          <div className={styles.allLoadedContainer}>
            <p className={styles.allLoadedText}>
              ✓ All {sortedAndFilteredData.length} items loaded
              {searchTerm && ` (filtered from ${statistics.totalCount} total)`}
            </p>
          </div>
        )}
      </div>

      {/* Add Example Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Example"
        onConfirm={handleAddExample}
        confirmText="Add"
        cancelText="Cancel"
      >
        <div className={styles.modalIntroText}>
          <p className={styles.modalMainText}>
            Add a new example to the annotation dataset.
          </p>
          <p className={styles.modalSubText}>
            This example will be added to the current annotations and will appear in the scatter plot visualization.
          </p>
        </div>
        <div className={styles.addExampleForm}>
          <label htmlFor="newExample" className={styles.formLabel}>
            Enter a new example text:
          </label>
          <textarea
            id="newExample"
            className={styles.formTextarea}
            value={newExample}
            onChange={(e) => setNewExample(e.target.value)}
            rows={5}
            placeholder="Type or paste your example text here..."
          />
        </div>
      </Modal>
    </div>
  );
};

export default PointDetails;
