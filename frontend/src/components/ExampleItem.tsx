import React, { useState } from "react";
import styles from "../styles/ExampleItem.module.css";
import { DataPoint } from "../types/data";
import { DownOutlined, ReloadOutlined } from '@ant-design/icons';
import * as d3 from "d3";

interface ExampleItemProps {
  point: DataPoint;
  isSelected: boolean;
  onClick: () => void;
  previousAnnotations?: DataPoint[];
  hideGuidelineImprovement?: boolean;
  onReannotate?: (point: DataPoint) => void;
  showAnnotationColor?: boolean;
  colorScheme?: string[];
  allAnnotationValues?: string[];
}

const PLOT_COLORS = {
  SINGLE: [
    "#3949AB",
    "#F57C00",
    "#388E3C",
    "#C62828",
    "#6A1B9A",
    "#0097A7",
    "#5D4037",
    "#EF6C00",
    "#757575",
    "#283593",
    "#E91E63",
    "#4CAF50"
  ]
};

const ExampleItem: React.FC<ExampleItemProps> = ({ point, isSelected, onClick, previousAnnotations, hideGuidelineImprovement, onReannotate, showAnnotationColor = false, colorScheme = PLOT_COLORS.SINGLE, allAnnotationValues = [] }) => {
  // Control content expansion/collapse state
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate annotation color
  const getAnnotationColor = () => {
    if (!showAnnotationColor) return null;
    
    const colorScale = d3
      .scaleOrdinal<string, string>()
      .domain(allAnnotationValues.length > 0 ? allAnnotationValues : [String(point.annotation)])
      .range(colorScheme);
    
    return colorScale(String(point.annotation));
  };

  // Handle click on the entire item, trigger both selection and expansion logic
  const handleItemClick = () => {
    onClick(); // Call onClick event passed from parent component to trigger item selection
    setIsExpanded(!isExpanded); // Also toggle expand/collapse state
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
    const annotationStr = String(point.annotation);
    return (
      <span className={`${styles.value} ${styles.annotationValue}`}>
        {annotationStr}
      </span>
    );
  };

  // Get the compact annotation label for the header (truncated to 8 characters)
  const getAnnotationLabel = () => {
    const annotationStr = String(point.annotation);
    const truncatedAnnotation = annotationStr.length > 8 ? annotationStr.substring(0, 8) : annotationStr;
    
    // Get background color
    const backgroundColor = showAnnotationColor ? getAnnotationColor() : null;
    
    return (
      <span 
        className={`${styles.headerAnnotation} ${styles.headerAnnotationValue}`}
        title={annotationStr} // Show full value on hover
        style={backgroundColor ? { 
          backgroundColor,
          color: 'white', // Use white text to ensure readability on colored background
          border: `1px solid ${backgroundColor}`,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', // Add text shadow to improve readability
      fontWeight: '600' // Increase font weight
        } : undefined}
      >
        {truncatedAnnotation}
      </span>
    );
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
              <ReloadOutlined className={styles.reannotateIcon} />
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