import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styles from "../styles/DualScatterPlot.module.css";
import { DataPoint } from "../types/data";
import * as d3 from "d3";
import type { BaseType } from "d3";

interface PlotConfig {
  data: DataPoint[];
  showSharedLegend?: boolean;
  showClusterLegend?: boolean;
  forcedAxes?: boolean;
  clusterPrefix?: string;  // Add this to support custom cluster prefixes (0-3 vs A-D)
  colorScheme?: string[];  // Add this to support custom color schemes
  title?: string;          // Optional title for the plot
}

interface DualScatterPlotProps {
  topPlot: PlotConfig;
  bottomPlot?: PlotConfig; // Make bottom plot optional for single mode
  onPointClick?: (point: DataPoint) => void;
  selectedPoint?: DataPoint | null;
  isSingleMode?: boolean;  // New flag to indicate single plot mode
  onPointHover?: (point: DataPoint | null) => void; // Add hover handler
  hoveredPoint?: DataPoint | null; // Add hovered point
}

// Add a consistent color definition near the top of the component, before any render functions
// 8 distinct colors with consistent saturation and brightness
// First 4 for top plot, last 4 for bottom plot
const PLOT_COLORS = {
  // Top plot colors (bold, primary palette)
  TOP: [
    "#E53935", // Bright Red
    "#1E88E5", // Bright Blue
    "#FFC107", // Amber Yellow
    "#8E24AA"  // Rich Purple
  ],
  // Bottom plot colors (distinct secondary palette with similar saturation/brightness)
  BOTTOM: [
    "#00ACC1", // Bright Teal
    "#D81B60", // Bright Pink
    "#FB8C00", // Bright Orange
    "#43A047", // Bright Green
    "#3949AB", // Indigo
    "#F57C00", // Deep Orange
    "#388E3C", // Green
    "#C62828", // Deep Red
    "#757575"  // Grey for clusters > 8
  ],
  // Colors for single mode (using the ScatterPlot colors) - expanded for more clusters
  SINGLE: [
    "#3949AB", // Indigo (0)
    "#F57C00", // Deep Orange (1)
    "#388E3C", // Green (2)
    "#C62828", // Deep Red (3)
    "#6A1B9A", // Purple (4)
    "#0097A7", // Cyan (5)
    "#5D4037", // Brown (6)
    "#EF6C00", // Orange (7)
    "#757575", // Grey (8)
    "#283593", // Deep Indigo (9)
    "#E91E63", // Pink (10+)
    "#4CAF50"  // Light Green (fallback)
  ]
};

const DualScatterPlot = ({
  topPlot,
  bottomPlot,
  onPointClick,
  selectedPoint,
  isSingleMode = false,
  onPointHover,
  hoveredPoint: externalHoveredPoint
}: DualScatterPlotProps) => {
  // Debug: log data changes
  useEffect(() => {
    console.log("DualScatterPlot data changed:", {
      topPlotDataCount: topPlot.data?.length || 0,
      bottomPlotDataCount: bottomPlot?.data?.length || 0,
      topPlotFirstItem: topPlot.data?.[0],
      bottomPlotFirstItem: bottomPlot?.data?.[0]
    });
  }, [topPlot.data, bottomPlot?.data]);

  // Create a derived state that tracks if the selected point exists in each dataset
  const [topSelectedPoint, setTopSelectedPoint] = useState<DataPoint | null>(null);
  const [bottomSelectedPoint, setBottomSelectedPoint] = useState<DataPoint | null>(null);
  
  // Add drag detection state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  
  // Refs for main SVG elements to coordinate resets
  const topPlotRef = useRef<HTMLDivElement>(null);
  const bottomPlotRef = useRef<HTMLDivElement>(null);

  // Add local state to control legend display
  const [showLegend, setShowLegend] = useState(true);

  // Shared tooltip state - use external state if provided, otherwise local state
  const [localHoveredPoint, setLocalHoveredPoint] = useState<DataPoint | null>(null);
  const hoveredPoint = externalHoveredPoint !== undefined ? externalHoveredPoint : localHoveredPoint;
  const handlePointHover = useCallback((point: DataPoint | null) => {
    if (onPointHover) {
      onPointHover(point);
    } else {
      setLocalHoveredPoint(point);
    }
  }, [onPointHover]);
  
  // State for each plot dimensions and loading
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const topSvgRef = useRef<SVGSVGElement>(null);
  const bottomSvgRef = useRef<SVGSVGElement>(null);
  const [, setIsTopLoading] = useState(true);
  const [, setIsBottomLoading] = useState(true);
  
  // Refs for zoom behaviors - initialize only once
  const topZoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const bottomZoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Prevent circular triggering during zoom synchronization
  const isTopSyncingRef = useRef<boolean>(false);
  const isBottomSyncingRef = useRef<boolean>(false);
  
  // Prevent duplicate rendering
  const isTopRenderingRef = useRef<boolean>(false);
  const isBottomRenderingRef = useRef<boolean>(false);

  // Memoize data processing
  const processedTopData = useMemo(() => {
    if (!topPlot.data || topPlot.data.length === 0) return [];
    
    return topPlot.data;
  }, [topPlot.data]);

  const processedBottomData = useMemo(() => {
    if (!bottomPlot?.data || bottomPlot.data.length === 0) return [];
    
    return bottomPlot.data;
  }, [bottomPlot?.data]);

  // Add this function somewhere near the top, before renderSharedLegend
  const getClusterLabel = (clusterNumber: number, prefix?: string, isLetterBased?: boolean): string => {
    if (isLetterBased) {
      // Convert number to letter (0 -> A, 1 -> B, 2 -> C, etc.)
      const letter = String.fromCharCode(65 + clusterNumber); // ASCII: A = 65, B = 66, etc.
      return prefix ? `${prefix}${letter}` : letter;
    }
    // For numerical labels, add 1 to convert from 0-based to 1-based (0 -> 1, 1 -> 2, etc.)
    return prefix ? `${prefix}${clusterNumber + 1}` : `${clusterNumber + 1}`;
  };

  // Update renderSharedLegend function
  const renderSharedLegend = useCallback(() => {
    // Clear existing legend
    if (containerRef.current) {
      const existingLegend = containerRef.current.querySelector('.shared-legend-container');
      if (existingLegend) {
        existingLegend.remove();
      }
    }
    
    // Use local state to control legend display
    if (!showLegend || 
        (topPlot.showSharedLegend === false && (!isSingleMode && bottomPlot?.showSharedLegend === false)) || 
        !containerRef.current) {
      return;
    }
    
    // Create a shared legend container
    const legendContainer = document.createElement('div');
    legendContainer.className = `${styles.sharedLegendContainer} shared-legend-container`;
    
    // Force visible styles with important flags
    legendContainer.style.cssText = `
      position: absolute !important;
      top: ${isSingleMode ? '20px' : '45%'} !important; 
      right: 20px !important;
      background-color: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 4px !important;
      padding: 6px 8px !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      z-index: 1000 !important;
      opacity: 1 !important;
      pointer-events: none !important;
      max-width: 180px !important;
    `;
    
    // Add annotation shapes legend
    const shapesLegend = document.createElement('div');
    shapesLegend.className = styles.legendSection;
    shapesLegend.style.marginBottom = '5px';
    
    const shapesTitle = document.createElement('h4');
    shapesTitle.innerText = 'Annotation Type';
    shapesTitle.className = styles.legendTitle;
    shapesTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
    shapesLegend.appendChild(shapesTitle);
    
    // Update these to match the actual plot items exactly
    const shapeItems = [
      { label: "Unclear (-1)", shape: "diamond", color: "#777777" },  // Diamond for unclear annotation (-1)
      { label: "Negative (0)", shape: "circle", color: "#777777" },    // Circle for negative (0)
      { label: "Positive (1)", shape: "cross", color: "#777777" }     // Cross for positive (1)
    ];
    
    const shapesList = document.createElement('ul');
    shapesList.className = styles.legendList;
    shapesList.style.cssText = 'list-style: none !important; padding: 0 !important; margin: 0 !important;';
    
    shapeItems.forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = styles.legendItem;
      listItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 3px !important;';
      
      const shape = document.createElement('span');
      shape.className = styles.legendShape;
      
      // Apply direct inline styles to ensure visibility and match the plot
      if (item.shape === "circle") {
        // Circle for "Neutral"
        shape.style.cssText = `
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          background-color: ${item.color} !important;
          border-radius: 50% !important;
          margin-right: 8px !important;
        `;
      } else if (item.shape === "cross") {
        // Cross for "Positive"
        shape.style.cssText = `
          display: inline-block !important;
          position: relative !important;
          width: 12px !important;
          height: 12px !important;
          margin-right: 8px !important;
        `;
        
        // Create cross using two spans
        const crossBefore = document.createElement('span');
        crossBefore.style.cssText = `
          position: absolute !important;
          left: 4px !important;
          top: 0px !important;
          width: 4px !important;
          height: 12px !important;
          background-color: ${item.color} !important;
        `;
        
        const crossAfter = document.createElement('span');
        crossAfter.style.cssText = `
          position: absolute !important;
          top: 4px !important;
          left: 0px !important;
          width: 12px !important;
          height: 4px !important;
          background-color: ${item.color} !important;
        `;
        
        shape.appendChild(crossBefore);
        shape.appendChild(crossAfter);
      } else if (item.shape === "diamond") {
        // Diamond for "Unclear"
        shape.style.cssText = `
          display: inline-block !important;
          position: relative !important;
          width: 12px !important;
          height: 12px !important;
          background-color: ${item.color} !important;
          margin-right: 8px !important;
          transform: rotate(45deg) !important;
        `;
      } else if (item.shape === "minus") {
        // Minus for "Negative"
        shape.style.cssText = `
          display: inline-block !important;
          position: relative !important;
          width: 12px !important;
          height: 12px !important;
          margin-right: 8px !important;
        `;
        
        // Create minus using a single span
        const minus = document.createElement('span');
        minus.style.cssText = `
          position: absolute !important;
          top: 4px !important;
          left: 0px !important;
          width: 12px !important;
          height: 4px !important;
          background-color: ${item.color} !important;
        `;
        
        shape.appendChild(minus);
      }
      
      const label = document.createElement('span');
      label.className = styles.legendLabel;
      label.innerText = item.label;
      label.style.cssText = 'font-size: 10px !important; color: #000 !important;';
      
      listItem.appendChild(shape);
      listItem.appendChild(label);
      shapesList.appendChild(listItem);
    });
    
    shapesLegend.appendChild(shapesList);
    legendContainer.appendChild(shapesLegend);
    
    // Add size legend
    const sizeLegend = document.createElement('div');
    sizeLegend.className = styles.legendSection;
    sizeLegend.style.marginBottom = '5px';
    
    const sizeTitle = document.createElement('h4');
    sizeTitle.innerText = 'Point Size';
    sizeTitle.className = styles.legendTitle;
    sizeTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
    sizeLegend.appendChild(sizeTitle);
    
    const sizeDesc = document.createElement('p');
    sizeDesc.innerText = 'Smaller points = Higher confidence';
    sizeDesc.className = styles.legendDesc;
    sizeDesc.style.cssText = 'margin: 0 !important; font-size: 11px !important; color: #000 !important;';
    sizeLegend.appendChild(sizeDesc);
    
    legendContainer.appendChild(sizeLegend);
    
    // Add cluster colors legend if enabled
    if (topPlot.showClusterLegend !== false && topPlot.data && Array.isArray(topPlot.data)) {
      // Create a top clusters legend section
      const topColorLegend = document.createElement('div');
      topColorLegend.className = styles.legendSection;
      topColorLegend.style.marginBottom = '10px';
      
      const topColorTitle = document.createElement('h4');
      const titleText = isSingleMode 
        ? 'Clusters'
        : 'Main Clusters';
      topColorTitle.innerText = titleText;
      topColorTitle.className = styles.legendTitle;
      topColorTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
      topColorLegend.appendChild(topColorTitle);
      
      // Create color scale for top plot using the same scale as in renderPlot
      const topColorScale = d3
        .scaleOrdinal<number, string>()
        .domain([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        .range(topPlot.colorScheme || PLOT_COLORS.SINGLE);
      
      // Get unique cluster values from top dataset
      const topUniqueClusters = new Set<number>();
      topPlot.data.forEach(d => topUniqueClusters.add(d.new_cluster_id || 0));
      
      // Convert to array and sort
      const topClusterValues = Array.from(topUniqueClusters).sort((a, b) => a - b);
      
      // Create the color scale entries for the legend
      const topColorScaleEntries = topClusterValues.map(value => ({
        value,
        color: topColorScale(value)
      }));
      
      const topColorsList = document.createElement('ul');
      topColorsList.className = styles.legendList;
      topColorsList.style.cssText = 'list-style: none !important; padding: 0 !important; margin: 0 !important;';
      
      topColorScaleEntries.forEach(item => {
        const listItem = document.createElement('li');
        listItem.className = styles.legendItem;
        listItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 3px !important;';
        
        const color = document.createElement('span');
        color.className = styles.legendColor;
        color.style.cssText = `
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          background-color: ${item.color} !important;
          margin-right: 8px !important;
          border-radius: 2px !important;
        `;
        
        const label = document.createElement('span');
        label.className = styles.legendLabel;
        // Use numeric labels for top plot
        label.innerText = getClusterLabel(item.value, topPlot.clusterPrefix, false);
        label.style.cssText = 'font-size: 10px !important; color: #000 !important;';
        
        listItem.appendChild(color);
        listItem.appendChild(label);
        topColorsList.appendChild(listItem);
      });
      
      topColorLegend.appendChild(topColorsList);
      legendContainer.appendChild(topColorLegend);
    }
    
    // Create a bottom clusters legend section in dual mode only
    if (!isSingleMode && bottomPlot && bottomPlot.showClusterLegend !== false && bottomPlot.data && Array.isArray(bottomPlot.data)) {
      const bottomColorLegend = document.createElement('div');
      bottomColorLegend.className = styles.legendSection;
      bottomColorLegend.style.marginBottom = '3px';
      
      const bottomColorTitle = document.createElement('h4');
      bottomColorTitle.innerText = 'Edge Case Clusters';
      bottomColorTitle.className = styles.legendTitle;
      bottomColorTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
      bottomColorLegend.appendChild(bottomColorTitle);
      
      // Create color scale for bottom plot using the same scale as in renderPlot
      const bottomColorScale = d3
        .scaleOrdinal<number, string>()
        .domain([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        .range(bottomPlot.colorScheme || PLOT_COLORS.SINGLE);
      
      // Get unique cluster values from bottom dataset
      const bottomUniqueClusters = new Set<number>();
      bottomPlot.data.forEach(d => {
        // Use cluster ID directly
        const clusterValue = d.new_cluster_id || 0;
        bottomUniqueClusters.add(clusterValue);
      });
      
      // Convert to array and sort
      const bottomClusterValues = Array.from(bottomUniqueClusters).sort((a, b) => a - b);
      
      const bottomColorsList = document.createElement('ul');
      bottomColorsList.className = styles.legendList;
      bottomColorsList.style.cssText = 'list-style: none !important; padding: 0 !important; margin: 0 !important;';
      
      // Add all clusters including Others
      bottomClusterValues.forEach(value => {
        const listItem = document.createElement('li');
        listItem.className = styles.legendItem;
        listItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 3px !important;';
        
        const color = document.createElement('span');
        color.className = styles.legendColor;
        color.style.cssText = `
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          background-color: ${bottomColorScale(value)} !important;
          margin-right: 8px !important;
          border-radius: 2px !important;
        `;
        
        const label = document.createElement('span');
        label.className = styles.legendLabel;
        // Show the cluster label directly
        label.innerText = getClusterLabel(value, bottomPlot.clusterPrefix, true);
        label.style.cssText = 'font-size: 10px !important; color: #000 !important;';
        
        listItem.appendChild(color);
        listItem.appendChild(label);
        bottomColorsList.appendChild(listItem);
      });
      
      bottomColorLegend.appendChild(bottomColorsList);
      legendContainer.appendChild(bottomColorLegend);
    }
    
    // Insert the legend directly into the container to ensure visibility
    if (containerRef.current) {
      containerRef.current.appendChild(legendContainer);
    }
    
  }, [topPlot.showSharedLegend, topPlot.showClusterLegend, 
     showLegend, topPlot.data, topPlot.clusterPrefix, 
     topPlot.colorScheme, isSingleMode, bottomPlot]);

  // NOW define toggleLegend function AFTER renderSharedLegend is defined
  // Function to toggle legend display status
  const toggleLegend = useCallback(() => {
    setShowLegend(prev => {
      const newValue = !prev;
      
      // Force immediate update to legend visibility
      setTimeout(() => {
        if (newValue) {
          renderSharedLegend();
        } else {
          // Remove any existing legends
          if (containerRef.current) {
            const existingLegend = containerRef.current.querySelector('.shared-legend-container');
            if (existingLegend) {
              existingLegend.remove();
            }
          }
        }
      }, 0);
      
      return newValue;
    });
  }, [renderSharedLegend]);

  // Update the selected points in each plot whenever the main selected point changes
  useEffect(() => {
    if (!selectedPoint) {
      setTopSelectedPoint(null);
      setBottomSelectedPoint(null);
      return;
    }

    // Try to find matching points in both datasets
    // First try to match by UID
    const topMatchByUid = selectedPoint.uid && topPlot.data && Array.isArray(topPlot.data)
      ? topPlot.data.find(p => p.uid === selectedPoint.uid)
      : null;
    
    const bottomMatchByUid = !isSingleMode && bottomPlot && bottomPlot.data && Array.isArray(bottomPlot.data) && selectedPoint.uid 
      ? bottomPlot.data.find(p => p.uid === selectedPoint.uid)
      : null;
      
    // If no match by UID, try to match by text_to_annotate
    const topMatchByText = !topMatchByUid && topPlot.data && Array.isArray(topPlot.data)
      ? topPlot.data.find(p => p.text_to_annotate === selectedPoint.text_to_annotate)
      : null;
      
    const bottomMatchByText = !isSingleMode && bottomPlot && bottomPlot.data && Array.isArray(bottomPlot.data) && !bottomMatchByUid 
      ? bottomPlot.data.find(p => p.text_to_annotate === selectedPoint.text_to_annotate)
      : null;
      
    setTopSelectedPoint(topMatchByUid || topMatchByText || null);
    setBottomSelectedPoint(bottomMatchByUid || bottomMatchByText || null);
  }, [selectedPoint, topPlot.data, bottomPlot?.data, isSingleMode, bottomPlot]);
  
  // Update dimensions when container size changes
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  // Calculate dynamic margins based on container size
  const getMargins = useCallback(() => {
    // Use smaller margins for smaller containers
    const baseMargin = { top: 40, right: 40, bottom: 60, left: 50 };
    
    if (dimensions.height < 300) {
      return { 
        top: Math.max(20, baseMargin.top * 0.7), 
        right: Math.max(20, baseMargin.right * 0.7), 
        bottom: Math.max(40, baseMargin.bottom * 0.7), 
        left: Math.max(25, baseMargin.left * 0.7) 
      };
    }
    
    return baseMargin;
  }, [dimensions.height]);
  
  // Click handler function, ensuring no interference with zooming
  const handlePointClick = useCallback((event: MouseEvent, d: DataPoint) => {
    // Stop propagation to prevent triggering zoom behavior
    event.stopPropagation();
    // Prevent default to avoid any browser-specific behaviors
    event.preventDefault();
    
    if (onPointClick) {
      onPointClick(d);
    }
  }, [onPointClick]);
  
  // New handler for background clicks to deselect points
  const handleBackgroundClick = useCallback((event: MouseEvent) => {
    // Only handle direct clicks on the SVG or zoom area, not bubbled events
    if (event.target === event.currentTarget || 
        (event.target as Element).classList.contains('zoom-area')) {
      // Stop propagation and prevent default
      event.stopPropagation();
      event.preventDefault();
      
      if (onPointClick && selectedPoint) {
        onPointClick(selectedPoint); // Clicking the selected point again deselects it
      }
    }
  }, [onPointClick, selectedPoint]);

  // Shared rendering function for both plots
  const renderPlot = useCallback((
    svgRef: React.RefObject<SVGSVGElement | null>,
    zoomRef: React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>,
    data: DataPoint[],
    selectedPointData: DataPoint | null,
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
    forcedAxes: boolean = false,
    syncWith?: {
      ref: React.RefObject<SVGSVGElement | null>,
      zoom: React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>,
      syncingRef: React.RefObject<boolean>
    },
    thisSyncingRef?: React.RefObject<boolean>,
    isRenderingRef?: React.RefObject<boolean>,
    isTopPlot: boolean = true,
    _clusterPrefix?: string,
    colorScheme?: string[],
    isSingleMode: boolean = false
  ) => {
    if (!svgRef.current || !data || !Array.isArray(data) || data.length === 0 || dimensions.width === 0) {
      return;
    }
    
    // Prevent duplicate rendering
    if (isRenderingRef && isRenderingRef.current) return;
    if (isRenderingRef) isRenderingRef.current = true;

    setIsLoading(true);

    const { width, height } = dimensions;
    const margin = getMargins();
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = isSingleMode 
      ? height - margin.top - margin.bottom 
      : height/2 - margin.top - margin.bottom; // Share height equally in dual mode
    const basePointRadius = dimensions.height < 300 ? 1.5 : 2;

    // Store current transform if it exists (to preserve zoom state)
    let currentTransform = d3.zoomIdentity;
    if (zoomRef.current && svgRef.current) {
      try {
        const existingTransform = d3.zoomTransform(svgRef.current);
        if (existingTransform && existingTransform.k !== 1) {
          currentTransform = existingTransform;
        }
      } catch (e) {
        console.error("Error getting zoom transform:", e);
      }
    }

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", isSingleMode ? height : height/2)
      .attr("class", styles.scatterPlot);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
      
    // Add background layer to receive zoom and drag events
    g.append("rect")
      .attr("class", "zoom-area")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .attr("pointer-events", "all") // Ensure this element can receive events
      .style("cursor", "grab") // Explicitly add cursor style
      .on("mousedown", function() {
        d3.select(this).style("cursor", "grabbing");
      })
      .on("mouseup", function() {
        d3.select(this).style("cursor", "grab");
      })
      .on("click", (event: MouseEvent) => {
        // Handle background clicks to deselect points
        if (selectedPointData) {
          handleBackgroundClick(event);
        }
      });

    // Size scale function for confidence
    const getSizeFromConfidence = (confidence: number) => {
      if (confidence === undefined || confidence === null || isNaN(confidence)) {
        return basePointRadius * 35;
      }
      
      // INCREASED CONTRAST: Create larger difference between high and low confidence
      if (confidence < 30) return basePointRadius * 150; // Very low confidence (0-30)
      if (confidence < 50) return basePointRadius * 100;  // Low confidence (30-50)
      if (confidence < 70) return basePointRadius * 60;  // Medium confidence (50-70)
      if (confidence < 90) return basePointRadius * 30;  // High confidence (70-90)
      return basePointRadius * 10;                        // Very high confidence (90-100)
    };

    // Categorize annotation values
    const getAnnotationType = (annotation: string | number): "positive" | "negative" | "neutral" | "unclear" => {
      if (annotation === 1 || annotation === "1") {
        return "positive";
      } else if (annotation === -1 || annotation === "-1") {
        return "unclear";
      } else {
        return "neutral";
      }
    };

    // Create scales
    const xExtent = d3.extent(data, (d) => d.pca_x) as [number, number];
    const yExtent = d3.extent(data, (d) => d.pca_y) as [number, number];
    
    // Handle edge cases where extent might be undefined or contain NaN
    const safeXExtent: [number, number] = [
      isFinite(xExtent[0]) ? xExtent[0] : -1,
      isFinite(xExtent[1]) ? xExtent[1] : 1
    ];
    const safeYExtent: [number, number] = [
      isFinite(yExtent[0]) ? yExtent[0] : -1,
      isFinite(yExtent[1]) ? yExtent[1] : 1
    ];
    
    const xScale = d3
      .scaleLinear()
      .domain(safeXExtent)
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain(safeYExtent)
      .range([innerHeight, 0])
      .nice();

    // In renderPlot function, update the color scale
    const colorScale = d3
      .scaleOrdinal<number, string>()
      .domain([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])  // Support more cluster IDs
      .range(colorScheme || (isTopPlot 
        ? PLOT_COLORS.SINGLE 
        : PLOT_COLORS.SINGLE));

    // Add X and Y Axes
    if (forcedAxes || height >= 200) {
      // X Axis
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .attr("class", styles.axis)
        .call(d3.axisBottom(xScale).ticks(width < 400 ? 5 : 10))
        .call(g => {
          // Style axis lines
          g.selectAll("line")
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 1);
          
          g.selectAll("path")
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 1);
          
          // Ensure tick labels don't overflow by clipping them to the available space
          g.selectAll("text")
            .style("font-size", "11px")
            .attr("fill", "#666")
            .each(function() {
              const text = d3.select(this);
              const bbox = (this as SVGTextElement).getBBox();
              const textX = parseFloat(text.attr("x") || "0");
              
              // If text extends beyond boundaries, truncate or adjust
              if (textX - bbox.width/2 < -margin.left) {
                text.attr("text-anchor", "start").attr("x", -margin.left + 5);
              } else if (textX + bbox.width/2 > innerWidth + margin.right) {
                text.attr("text-anchor", "end").attr("x", innerWidth + margin.right - 5);
              }
            });
        });

      // Add X-axis title
      g.append("text")
        .attr("text-anchor", "middle")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 35)
        .attr("fill", "#666")
        .style("font-size", "12px")
        .text(isTopPlot ? "Main Clusters" : "Edge Case Clusters");

      // Y Axis
      g.append("g")
        .attr("class", styles.axis)
        .call(d3.axisLeft(yScale).ticks(height < 300 ? 5 : 10))
        .call(g => {
          // Style axis lines
          g.selectAll("line")
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 1);
          
          g.selectAll("path")
            .attr("stroke", "#e2e8f0")
            .attr("stroke-width", 1);
          
          // Ensure tick labels don't overflow by clipping them to the available space
          g.selectAll("text")
            .style("font-size", "11px")
            .attr("fill", "#666")
            .each(function() {
              const text = d3.select(this);
              const bbox = (this as SVGTextElement).getBBox();
              const textY = parseFloat(text.attr("y") || "0");
              
              // If text extends beyond boundaries, adjust positioning
              if (textY - bbox.height/2 < -margin.top) {
                text.attr("y", -margin.top + bbox.height);
              } else if (textY + bbox.height/2 > innerHeight + margin.bottom) {
                text.attr("y", innerHeight + margin.bottom - 5);
              }
            });
        });
    }

    // Create a group for all data points to better organize
    const pointsContainer = g.append("g")
      .attr("class", "points-container");

    // Create symbol generators for different shapes based on annotation
    const symbolCircle = d3.symbol().type(d3.symbolCircle);  // For neutral annotations (0)
    const symbolCross = d3.symbol().type(d3.symbolCross);  // For positive annotations (1)
    const symbolDiamond = d3.symbol().type(d3.symbolDiamond);  // For unclear annotations (-1)

    // Add points
    pointsContainer
      .selectAll<SVGPathElement, DataPoint>("path")
      .data(data.filter(d => isFinite(d.pca_x) && isFinite(d.pca_y))) // Filter out invalid coordinates
      .join("path")
      .attr("d", d => {
        const size = getSizeFromConfidence(d.confidence);
        const annotationType = getAnnotationType(d.annotation);
        
        if (annotationType === "positive") {
          return symbolCross.size(size * 1.1)(); // Positive annotation: cross - reduced from 1.5 to 1.1
        } else if (annotationType === "unclear") {
          return symbolDiamond.size(size * 0.8)(); // Unclear annotation: diamond - reduced from 1.2 to 0.8
        } else {
          return symbolCircle.size(size)(); // Neutral annotation: circle - baseline
        }
      })
      .attr("transform", d => {
        return `translate(${xScale(d.pca_x)},${yScale(d.pca_y)})`;
      })
      .attr("fill", (d) => {
        // Use the cluster ID directly for better color distribution
        const clusterValue = d.new_cluster_id || 0;
        return colorScale(clusterValue);
      })
      .attr("class", (d) => {
        const isHovered = hoveredPoint && (
          (hoveredPoint.uid && d.uid && hoveredPoint.uid === d.uid) || 
          (hoveredPoint.text_to_annotate === d.text_to_annotate)
        );
        
        const isSelected = selectedPointData && (
          (selectedPointData.uid && d.uid && selectedPointData.uid === d.uid) || 
          (selectedPointData.text_to_annotate === d.text_to_annotate)
        );

        if (isSelected) return `${styles.point} ${styles.selectedPoint}`;
        if (isHovered) return `${styles.point} ${styles.hoveredPoint}`;
        return styles.point;
      })
      .attr("stroke", (d) => {
        const isHovered = hoveredPoint && (
          (hoveredPoint.uid && d.uid && hoveredPoint.uid === d.uid) || 
          (hoveredPoint.text_to_annotate === d.text_to_annotate)
        );
        
        const isSelected = selectedPointData && (
          (selectedPointData.uid && d.uid && selectedPointData.uid === d.uid) || 
          (selectedPointData.text_to_annotate === d.text_to_annotate)
        );
        
        if (isSelected) return "#000";
        if (isHovered) return "#333";
        return "#555"; // Light gray stroke instead of none for better definition
      })
      .attr("stroke-width", (d) => {
        const isHovered = hoveredPoint && (
          (hoveredPoint.uid && d.uid && hoveredPoint.uid === d.uid) || 
          (hoveredPoint.text_to_annotate === d.text_to_annotate)
        );
        
        const isSelected = selectedPointData && (
          (selectedPointData.uid && d.uid && selectedPointData.uid === d.uid) || 
          (selectedPointData.text_to_annotate === d.text_to_annotate)
        );
        
        if (isSelected) return 2;
        if (isHovered) return 1.5;
        return 0.5; // Thin stroke for all points instead of 0
      })
      .attr("opacity", 0.7)
      .attr("pointer-events", "all") // Ensure points can receive events
      .on("mousedown", function(event) {
        // Record the starting position of potential drag
        dragStartPos.current = { x: event.clientX, y: event.clientY };
        setIsDragging(false);
      })
      .on("mousemove", function(event) {
        // If mousedown was detected and we've moved more than a small threshold, it's a drag
        if (dragStartPos.current) {
          const dx = Math.abs(event.clientX - dragStartPos.current.x);
          const dy = Math.abs(event.clientY - dragStartPos.current.y);
          if (dx > 3 || dy > 3) {
            setIsDragging(true);
          }
        }
      })
      .on("mouseover", function(this: BaseType | SVGPathElement, _event: PointerEvent, d: DataPoint) {
        const element = d3.select(this);
        element
          .raise()
          .attr("opacity", 1)
          .attr("stroke", "#333")
          .attr("stroke-width", 1.5);
          
        // No longer using zoom transform to avoid layout reflow
        handlePointHover(d);
      })
      .on("mouseout", function(this: BaseType | SVGPathElement, _event: PointerEvent, d: DataPoint) {
        // Reset drag detection state
        dragStartPos.current = null;
        setIsDragging(false);
        
        const element = d3.select(this);
        
        const isSelected = selectedPointData && (
          (selectedPointData.uid && d.uid && selectedPointData.uid === d.uid) || 
          (selectedPointData.text_to_annotate === d.text_to_annotate)
        );
        
        if (!isSelected) {
          element
            .attr("opacity", 0.7)
            .attr("stroke", "#555")
            .attr("stroke-width", 0.5);
        }

        handlePointHover(null);
      })
      .on("click", function(event: MouseEvent, d: DataPoint) {
        // Only trigger click if it wasn't part of a drag operation
        if (!isDragging) {
          // Explicitly call stopPropagation and preventDefault
          event.stopPropagation();
          event.preventDefault();
          
          handlePointClick(event, d);
        }
        
        // Reset drag detection state
        dragStartPos.current = null;
        setIsDragging(false);
      });

    // Apply visualization to selected point
    if (selectedPointData) {
      const matchingElements = pointsContainer.selectAll<SVGPathElement, DataPoint>("path")
        .filter(d => {
          if (selectedPointData.uid && d.uid) {
            return d.uid === selectedPointData.uid;
          }
          return d.text_to_annotate === selectedPointData.text_to_annotate;
        });
        
      matchingElements
        .raise()
        .attr("opacity", 1)
        .style("stroke", "#000 !important") 
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "none")
        // FIX: Ensure selected points don't block events by removing pointer-events
        .style("pointer-events", "all"); // Keep pointer events enabled but with careful handling
      
      matchingElements.each(function() {
        const element = d3.select(this);
                      
        // Don't use zoom transform, only use thicker stroke
        // element.attr("transform", `translate(${xScale(selectedPointData.pca_x)},${yScale(selectedPointData.pca_y)}) scale(1.8)`);
        
        // Add animation, but ensure it doesn't interfere with zooming
        element
          .transition()
          .duration(800)
          .attr("stroke-width", 3)
          .transition()
          .duration(800)
          .attr("stroke-width", 2)
          .on("end", function repeat() {
            // Check if element exists to avoid animation continuing after element is removed
            if (d3.select(this).node()) {
              d3.select(this)
                .transition()
                .duration(800)
                .attr("stroke-width", 3)
                .transition()
                .duration(800)
                .attr("stroke-width", 2)
                .on("end", repeat);
            }
          });
      });
    }

    // Apply visualization to hovered point if not the selected point
    if (hoveredPoint && (!selectedPointData || 
        (selectedPointData.uid !== hoveredPoint.uid && 
         selectedPointData.text_to_annotate !== hoveredPoint.text_to_annotate))) {
      
      const matchingElements = pointsContainer.selectAll<SVGPathElement, DataPoint>("path")
        .filter(d => {
          if (hoveredPoint.uid && d.uid) {
            return d.uid === hoveredPoint.uid;
          }
          return d.text_to_annotate === hoveredPoint.text_to_annotate;
        });
        
      matchingElements
        .raise()
        .attr("opacity", 0.9)
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5);
    }

    // Create zoom behavior
    if (!zoomRef.current) {
      zoomRef.current = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 5])
        .on("zoom", (event) => {
          g.attr(
            "transform",
            `translate(${event.transform.x + margin.left},${
              event.transform.y + margin.top
            }) scale(${event.transform.k})`
          );

          // Synchronize the other chart's zoom, but prevent circular triggering
          if (syncWith && syncWith.ref.current && syncWith.zoom.current && thisSyncingRef) {
            if (!syncWith.syncingRef.current) {
              // Mark current chart as syncing
              thisSyncingRef.current = true;
              
              // Synchronize the other chart
              d3.select(syncWith.ref.current)
                .call(
                  syncWith.zoom.current.transform,
                  event.transform
                );
                
              // Reset the marker after synchronization is complete
              thisSyncingRef.current = false;
            }
          }
        })
        // IMPROVED FILTER: Enhanced filter logic to better handle interaction after point selection
        .filter(event => {
          // Always allow wheel events for zooming
          if (event.type === 'wheel') return true;
          
          // Always allow touchstart/touchmove for mobile zooming
          if (event.type === 'touchstart' || event.type === 'touchmove') return true;
          
          // For mousedown events (start of drag), only allow if:
          if (event.type === 'mousedown') {
            // Always allow middle button (wheel) and right button 
            if (event.button === 1 || event.button === 2) return true;
            
            // For left button clicks, we want to allow dragging on the background
            // Don't check isClickOnPoint anymore as it's preventing dragging
            return true;
          }
          
          // Allow all other events by default
          return true;
        });
    } else {
      // If zoom behavior already exists, update its event handler
      zoomRef.current.on("zoom", (event) => {
        g.attr(
          "transform",
          `translate(${event.transform.x + margin.left},${
            event.transform.y + margin.top
          }) scale(${event.transform.k})`
        );

        // Synchronize the other chart's zoom, but prevent circular triggering
        if (syncWith && syncWith.ref.current && syncWith.zoom.current && thisSyncingRef) {
          if (!syncWith.syncingRef.current) {
            // Mark current chart as syncing
            thisSyncingRef.current = true;
            
            // Synchronize the other chart
            d3.select(syncWith.ref.current)
              .call(
                syncWith.zoom.current.transform,
                event.transform
              );
              
            // Reset the marker after synchronization is complete
            thisSyncingRef.current = false;
          }
        }
      });
    }
    
    // Apply zoom behavior to the entire SVG, ensuring zoom events are correctly captured
    svg.call(zoomRef.current)
      .on("dblclick.zoom", null) // IMPORTANT FIX: Disable double-click zoom to avoid conflicts
      .on("click", (event: MouseEvent) => {
        // Prevent zoom behavior on background clicks that should deselect points
        // Only handle direct clicks on SVG background or zoom-area rect
        const targetElement = event.target as Element;
        const isBackgroundClick = targetElement === event.currentTarget || 
                                targetElement.classList.contains('zoom-area');
        
        if (isBackgroundClick && selectedPointData) {
          // Stop event propagation to prevent zoom conflict
          event.stopPropagation();
          handleBackgroundClick(event);
        }
      });
    
    // Restore previous zoom state
    if (currentTransform.k !== 1) {
      svg.call(zoomRef.current.transform, currentTransform);
    }

    // Add clickable areas to improve selectability, but ensure they don't block zoom events
    g.selectAll<SVGCircleElement, DataPoint>(".hitArea")
      .data(data.filter(d => isFinite(d.pca_x) && isFinite(d.pca_y))) // Filter out invalid coordinates
      .join("circle")
      .attr("class", "hitArea")
      .attr("cx", d => xScale(d.pca_x))
      .attr("cy", d => yScale(d.pca_y))
      .attr("r", d => Math.sqrt(getSizeFromConfidence(d.confidence) / Math.PI) * 1.5)
      .attr("fill", "transparent")
      .attr("stroke", "none")
      .style("cursor", "pointer")
      .attr("pointer-events", "all")
      .on("mousedown", function(event) {
        // Record the starting position of potential drag
        dragStartPos.current = { x: event.clientX, y: event.clientY };
        setIsDragging(false);
      })
      .on("mousemove", function(event) {
        // If mousedown was detected and we've moved more than a small threshold, it's a drag
        if (dragStartPos.current) {
          const dx = Math.abs(event.clientX - dragStartPos.current.x);
          const dy = Math.abs(event.clientY - dragStartPos.current.y);
          if (dx > 3 || dy > 3) {
            setIsDragging(true);
          }
        }
      })
      .on("mouseover", (_event, d) => {
        handlePointHover(d);
      })
      .on("mouseout", () => {
        // Reset drag detection state
        dragStartPos.current = null;
        setIsDragging(false);
        handlePointHover(null);
      })
      .on("click", (event: MouseEvent, d: DataPoint) => {
        // Only trigger click if it wasn't part of a drag operation
        if (!isDragging) {
          handlePointClick(event, d);
        }
        
        // Reset drag detection state
        dragStartPos.current = null;
        setIsDragging(false);
      });

    setIsLoading(false);
    if (isRenderingRef) isRenderingRef.current = false;
  }, [dimensions, getMargins, handlePointHover, handlePointClick, handleBackgroundClick, hoveredPoint, isDragging]);

  // Initialize legend state
  useEffect(() => {
    // Set initial legend state based on props
    setShowLegend(topPlot.showSharedLegend !== false && (!bottomPlot || bottomPlot.showSharedLegend !== false));
  }, [topPlot.showSharedLegend, bottomPlot?.showSharedLegend, bottomPlot]);

  // Add explicit effect to force legend render on component mount
  useEffect(() => {
    // Only run on component mount
    if (containerRef.current && dimensions.width > 0 && showLegend) {
      // Force render the legend after component mounts
      setTimeout(() => {
        renderSharedLegend();
      }, 100); // Small delay to ensure container is properly sized
    }
  }, [dimensions.width, showLegend, renderSharedLegend]); // Only re-run if dimensions or showLegend changes

  // Render both plots when dimensions change, but NOT on every hover
  useEffect(() => {
    if (dimensions.width === 0) return;
    
    // Debug dimensions to ensure they're being set correctly
    // console.log("DualScatterPlot dimensions:", dimensions);
    
    if (topSvgRef.current && processedTopData && Array.isArray(processedTopData)) {
      renderPlot(
        topSvgRef, 
        topZoomRef, 
        processedTopData, 
        topSelectedPoint, 
        setIsTopLoading, 
        topPlot.forcedAxes,
        // Only sync with bottom plot if not in single mode
        !isSingleMode && bottomSvgRef.current ? { 
          ref: bottomSvgRef, 
          zoom: bottomZoomRef,
          syncingRef: isBottomSyncingRef
        } : undefined,
        isTopSyncingRef,
        isTopRenderingRef,
        true, // isTopPlot
        topPlot.clusterPrefix,
        isSingleMode ? topPlot.colorScheme || PLOT_COLORS.SINGLE : topPlot.colorScheme,
        isSingleMode
      );
    }
    
    // Only render bottom plot if not in single mode
    if (!isSingleMode && bottomPlot && processedBottomData && Array.isArray(processedBottomData) && bottomSvgRef.current) {
      renderPlot(
        bottomSvgRef, 
        bottomZoomRef, 
        processedBottomData, 
        bottomSelectedPoint, 
        setIsBottomLoading, 
        bottomPlot.forcedAxes,
        { 
          ref: topSvgRef, 
          zoom: topZoomRef,
          syncingRef: isTopSyncingRef 
        },
        isBottomSyncingRef,
        isBottomRenderingRef,
        false, // isTopPlot
        bottomPlot.clusterPrefix,
        bottomPlot.colorScheme
      );
    }
    
    // Render the shared legend after both plots are rendered
    setTimeout(() => {
      renderSharedLegend();
    }, 200); // Small delay to ensure plots are rendered first
  }, [dimensions, processedTopData, processedBottomData, topSelectedPoint, bottomSelectedPoint, 
     renderPlot, renderSharedLegend, isSingleMode, 
     topPlot.clusterPrefix, bottomPlot?.clusterPrefix, topPlot.colorScheme, bottomPlot?.colorScheme,
     topPlot.forcedAxes, bottomPlot?.forcedAxes, bottomPlot]);

  // Separately handle hover point updates to avoid re-rendering the entire chart
  useEffect(() => {
    // Since hover effects are handled through mouseover/mouseout events, no additional logic is needed here
  }, [hoveredPoint]);

  const handleReset = useCallback(() => {
    // Reset both plots at once
    if (topSvgRef.current && topZoomRef.current) {
      isTopSyncingRef.current = true; // Prevent synchronization during reset
      d3.select(topSvgRef.current)
        .transition()
        .duration(750)
        .call(topZoomRef.current.transform, d3.zoomIdentity)
        .on("end", () => {
          isTopSyncingRef.current = false;
        });
    }
    
    // Only reset bottom plot if not in single mode
    if (!isSingleMode && bottomSvgRef.current && bottomZoomRef.current) {
      isBottomSyncingRef.current = true; // Prevent synchronization during reset
      d3.select(bottomSvgRef.current)
        .transition()
        .duration(750)
        .call(bottomZoomRef.current.transform, d3.zoomIdentity)
        .on("end", () => {
          isBottomSyncingRef.current = false;
        });
    }
  }, [isSingleMode]);

  // IMPORTANT FIX: Add a useEffect to maintain zoom capabilities when selectedPoint changes
  useEffect(() => {
    // Only initialize zoom when there is a selected point but no zoom behavior
    if (!topZoomRef.current || !bottomZoomRef.current) {
      return;
    }
    
    // No longer reset zoom behavior, only maintain point highlight state
    try {
      // Apply highlight effect to already rendered points
      if (topSvgRef.current && topSelectedPoint) {
        d3.select(topSvgRef.current)
          .selectAll<SVGPathElement, DataPoint>("path")
          .filter(d => {
            if (topSelectedPoint.uid && d.uid) {
              return d.uid === topSelectedPoint.uid;
            }
            return d.text_to_annotate === topSelectedPoint.text_to_annotate;
          })
          .raise()
          .attr("opacity", 1)
          .attr("stroke", "#000")
          .attr("stroke-width", 2);
      }
      
      if (bottomSvgRef.current && bottomSelectedPoint) {
        d3.select(bottomSvgRef.current)
          .selectAll<SVGPathElement, DataPoint>("path")
          .filter(d => {
            if (bottomSelectedPoint.uid && d.uid) {
              return d.uid === bottomSelectedPoint.uid;
            }
            return d.text_to_annotate === bottomSelectedPoint.text_to_annotate;
          })
          .raise()
          .attr("opacity", 1)
          .attr("stroke", "#000")
          .attr("stroke-width", 2);
      }
    } catch (e) {
      console.error("Error updating selected points:", e);
    }
  }, [topSelectedPoint, bottomSelectedPoint]);

  return (
    <div 
      className={styles.dualPlotContainer} 
      ref={containerRef} 
      // IMPORTANT FIX: Add a tabIndex to ensure the container can receive focus
      // This helps reset browser event handling state
      tabIndex={0} 
      // FIX: Add key handlers to help with accessibility and keyboard interaction
      onKeyDown={(e) => {
        // If Escape key is pressed, deselect the point
        if (e.key === 'Escape' && selectedPoint && onPointClick) {
          onPointClick(selectedPoint);
        }
      }}
    >
      <div className={styles.unifiedContainer}>
        {/* Combined controls for both plots */}
        <div className={styles.controlsContainer}>
          <button className={styles.resetButton} onClick={handleReset}>
            Reset View
          </button>
          <button 
            className={`${styles.toggleButton} ${showLegend ? styles.active : ''}`} 
            onClick={toggleLegend}
            title={showLegend ? "Hide Legend" : "Show Legend"}
          >
            {showLegend ? "Hide Legend" : "Show Legend"}
          </button>
        </div>
        
        {/* Top plot */}
        <div className={isSingleMode ? styles.singlePlotArea : styles.plotArea} ref={topPlotRef}>
          {topPlot.title && (
            <div className={styles.plotTitle}>
              <h3>{topPlot.title}</h3>
            </div>
          )}
          <div className={styles.svgContainer}>
            <svg ref={topSvgRef} className={styles.scatterPlot} />
          </div>
        </div>
        
        {/* Bottom plot - only render if not in single mode */}
        {!isSingleMode && bottomPlot && (
          <div className={styles.plotArea} ref={bottomPlotRef}>
            {bottomPlot.title && (
              <div className={styles.plotTitle}>
                <h3>{bottomPlot.title}</h3>
              </div>
            )}
            <div className={styles.svgContainer}>
              <svg ref={bottomSvgRef} className={styles.scatterPlot} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DualScatterPlot; 