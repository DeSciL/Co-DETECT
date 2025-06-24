import React, { useState } from "react";
import styles from "../styles/ExampleItem.module.css";
import { DataPoint } from "../types/data";
import { DownOutlined, PlusOutlined } from '@ant-design/icons';

interface ExampleItemProps {
  point: DataPoint;
  isSelected: boolean;
  onClick: () => void;
  previousAnnotations?: DataPoint[];
  hideGuidelineImprovement?: boolean;
  onReannotate?: (point: DataPoint) => void;
}

const ExampleItem: React.FC<ExampleItemProps> = ({ point, isSelected, onClick, previousAnnotations, hideGuidelineImprovement, onReannotate }) => {
  // Control content expansion/collapse state
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle click on the entire item, only trigger selection logic
  const handleItemClick = () => {
    onClick(); // Call onClick event passed from parent component to trigger item selection
  };

  // Handle click on expand/collapse button
  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling to parent element
    setIsExpanded(!isExpanded); // Toggle expand/collapse state
  };

  // Handle click on reannotate button
  const handleReannotateClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling to parent element
    if (onReannotate) {
      onReannotate(point);
    }
  };

  // Get confidence change indicator
  const getConfidenceChange = () => {
    if (!previousAnnotations) {
      return null;
    }
    
    const previousPoint = previousAnnotations.find(p => {
      const uidMatch = p.uid && point.uid && p.uid === point.uid;
      const textMatch = p.text_to_annotate === point.text_to_annotate;
      return uidMatch || textMatch;
    });
    
    if (!previousPoint) {
      return null;
    }
    
    const currentConfidence = typeof point.confidence === 'string' ? parseFloat(point.confidence) : point.confidence;
    const previousConfidence = typeof previousPoint.confidence === 'string' ? parseFloat(previousPoint.confidence) : previousPoint.confidence;
    const change = currentConfidence - previousConfidence;
    
    if (change > 0) {
      return <span className={styles.confidenceIncrease}>↑{change.toFixed(0)}</span>;
    } else if (change < 0) {
      return <span className={styles.confidenceDecrease}>↓{Math.abs(change).toFixed(0)}</span>;
    }
    return null;
  };

  // Handle various types of annotation values
  const renderAnnotationValue = () => {
    // Check if it's a number or "0"/"1"
    const annotationStr = String(point.annotation);
    if (point.annotation === 1 || annotationStr === "1") {
      return (
        <span className={`${styles.value} ${styles.hateSpeech}`}>
          Positive
        </span>
      );
    } else if (point.annotation === 0 || annotationStr === "0") {
      return (
        <span className={`${styles.value} ${styles.notHateSpeech}`}>
          Negative
        </span>
      );
    } else {
      // Handle other string values, such as "Unclear due to insufficient guideline"
      return (
        <span className={`${styles.value} ${styles.unclearAnnotation}`}>
          {annotationStr}
        </span>
      );
    }
  };

  // Get the compact annotation label for the header
  const getAnnotationLabel = () => {
    const annotationStr = String(point.annotation);
    if (point.annotation === 1 || annotationStr === "1") {
      return <span className={`${styles.headerAnnotation} ${styles.headerHateSpeech}`}>1</span>;
    } else if (point.annotation === 0 || annotationStr === "0") {
      return <span className={`${styles.headerAnnotation} ${styles.headerNotHateSpeech}`}>0</span>;
    } else {
      return <span className={`${styles.headerAnnotation} ${styles.headerUnclear}`}>?</span>;
    }
  };

  // Get a preview of the original text
  const getTextPreview = () => {
    if (!point.text_to_annotate) return '';
    
    // Get the first 30-35 characters and add ellipsis if the text is longer
    const maxLength = 35;
    const text = point.text_to_annotate.trim();
    
    if (text.length <= maxLength) {
      return text;
    }
    
    // Find the last space within the maxLength to avoid cutting words
    const truncatedText = text.substring(0, maxLength);
    const lastSpaceIndex = truncatedText.lastIndexOf(' ');
    
    if (lastSpaceIndex > maxLength / 3) {
      // Only use the space boundary if it's not too close to the beginning
      return truncatedText.substring(0, lastSpaceIndex) + '...';
    }
    
    return truncatedText + '...';
  };

  return (
    <div 
      className={`${styles.item} ${isSelected ? styles.selected : ''} ${isExpanded ? styles.expanded : ''}`}
      onClick={handleItemClick}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerInfo}>
            {getAnnotationLabel()}
            {point.isReannotated && (
              <span className={styles.newBadge}>NEW</span>
            )}
            {point.new_edge_case && (
              <span className={styles.edgeBadge}>Edge</span>
            )}
            <span className={styles.headerConfidence}>
              {typeof point.confidence === 'string' ? parseFloat(point.confidence) : point.confidence}%
              {getConfidenceChange()}
            </span>
            <span className={styles.headerPreview}>{getTextPreview()}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {onReannotate && (
            <div 
              className={styles.reannotateButton}
              onClick={handleReannotateClick}
              title="Re-annotate this example"
            >
              <PlusOutlined className={styles.reannotateIcon} />
            </div>
          )}
          <div 
            className={styles.expandIcon}
            onClick={handleExpandClick}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <DownOutlined 
              className={`${styles.chevron} ${isExpanded ? styles.expanded : ""}`}
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Original Text</h4>
            <p className={styles.text}>{point.text_to_annotate}</p>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Classification</h4>
            <div className={styles.grid}>
              <div className={styles.gridItem}>
                <span className={styles.label}>Annotation:</span>
                {renderAnnotationValue()}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>LLM Analysis</h4>
            <p className={styles.analysis}>{point.analyses}</p>
          </div>

          {!hideGuidelineImprovement && point.guideline_improvement && point.guideline_improvement !== "EMPTY" && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Guideline Improvement</h4>
              <p className={styles.improvement}>{point.guideline_improvement}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExampleItem; 