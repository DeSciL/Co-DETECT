import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styles from "../styles/DualScatterPlot.module.css";
import { DataPoint } from "../types/data";
import * as d3 from "d3";
import type { BaseType } from "d3";

interface PlotConfig {
  data: DataPoint[];
  showSharedLegend?: boolean;
  forcedAxes?: boolean;
  colorScheme?: string[];  // Color schemes for annotation values
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
      top: 50% !important; 
      right: 10px !important;
      transform: translateY(-50%) !important;
      background-color: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 4px !important;
      padding: 6px 8px !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      z-index: 1000 !important;
      opacity: 1 !important;
      pointer-events: none !important;
      max-width: 200px !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      display: block !important;
    `;
    
    // Add annotation shapes legend
    const shapesLegend = document.createElement('div');
    shapesLegend.className = styles.legendSection;
    shapesLegend.style.marginBottom = '8px';
    
    const shapesTitle = document.createElement('h4');
    shapesTitle.innerText = 'Main Clusters Legend';
    shapesTitle.className = styles.legendTitle;
    shapesTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
    shapesLegend.appendChild(shapesTitle);
    
    // Add explanation text
    const shapesExplanation = document.createElement('p');
    shapesExplanation.innerText = 'Colors = annotations\n+ = unclear (-1)\n● = others';
    shapesExplanation.style.cssText = 'color: #666 !important; margin: 0 0 6px 0 !important; font-size: 9px !important; line-height: 1.3 !important; white-space: pre-line !important;';
    shapesLegend.appendChild(shapesExplanation);
    
    // Helper function to check if annotation represents -1
    const isNegativeOne = (annotation: string) => {
      return String(annotation).trim().startsWith('-1');
    };
    
    // Get unique annotation values from the data to generate dynamic legend
    const allAnnotationValues = new Set<string>();
    if (topPlot.data && Array.isArray(topPlot.data)) {
      topPlot.data.forEach(d => allAnnotationValues.add(String(d.annotation)));
    }
    if (!isSingleMode && bottomPlot?.data && Array.isArray(bottomPlot.data)) {
      bottomPlot.data.forEach(d => allAnnotationValues.add(String(d.annotation)));
    }
    
    // Convert to array and sort
    const annotationValues = Array.from(allAnnotationValues).sort();
    
    // Create unified color scale for all annotations across both plots
    const unifiedColorScale = d3
      .scaleOrdinal<string, string>()
      .domain(annotationValues)
      .range(topPlot.colorScheme || PLOT_COLORS.SINGLE);
    
    // Generate shape items dynamically based on actual data
    const shapeItems = annotationValues.map(annotation => ({
      label: annotation, // Show full annotation value in legend
      shape: isNegativeOne(annotation) ? "x" : "circle",
      color: unifiedColorScale(annotation)
    }));
    
    const shapesList = document.createElement('ul');
    shapesList.className = styles.legendList;
    shapesList.style.cssText = 'list-style: none !important; padding: 0 !important; margin: 0 !important;';
    
    shapeItems.forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = styles.legendItem;
      listItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 3px !important;';
      
      const shape = document.createElement('span');
      shape.className = styles.legendShape;
      
      if (item.shape === "x") {
        // Plus/Cross shape for -1 annotations
        shape.innerText = '+';
        shape.style.cssText = `
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 12px !important;
          height: 12px !important;
          color: ${item.color} !important;
          font-weight: 900 !important;
          font-size: 18px !important;
          font-family: Arial, sans-serif !important;
          text-shadow: 
            1px 0 0 ${item.color}, 
            -1px 0 0 ${item.color}, 
            0 1px 0 ${item.color}, 
            0 -1px 0 ${item.color},
            0.7px 0.7px 0 ${item.color},
            -0.7px -0.7px 0 ${item.color},
            0.7px -0.7px 0 ${item.color},
            -0.7px 0.7px 0 ${item.color} !important;
          margin-right: 8px !important;
        `;
      } else {
        // Circle shape for other annotations
        shape.style.cssText = `
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          background-color: ${item.color} !important;
          border-radius: 50% !important;
          margin-right: 8px !important;
        `;
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
    sizeLegend.style.marginBottom = '8px';
    
    const sizeTitle = document.createElement('h4');
    sizeTitle.innerText = 'Point Size Legend';
    sizeTitle.className = styles.legendTitle;
    sizeTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
    sizeLegend.appendChild(sizeTitle);
    
    const sizeDesc = document.createElement('p');
    sizeDesc.innerText = 'Smaller = Higher confidence';
    sizeDesc.className = styles.legendDesc;
    sizeDesc.style.cssText = 'margin: 0 !important; font-size: 9px !important; color: #666 !important;';
    sizeLegend.appendChild(sizeDesc);
    
    legendContainer.appendChild(sizeLegend);
    
    // Add cluster colors legend for bottom plot (if not single mode)
    if (!isSingleMode && bottomPlot?.data && Array.isArray(bottomPlot.data)) {
      // Get all unique cluster values from bottom plot
      const allClusterValues = new Set<string>();
      bottomPlot.data.forEach(d => allClusterValues.add(String(d.new_cluster_id)));
      
      const clusterValues = Array.from(allClusterValues).sort();
      
      if (clusterValues.length > 0) {
        // Create cluster colors legend section
        const clusterColorLegend = document.createElement('div');
        clusterColorLegend.className = styles.legendSection;
        clusterColorLegend.style.marginBottom = '8px';
        
        const clusterColorTitle = document.createElement('h4');
        clusterColorTitle.innerText = 'Edge Case Clusters Legend';
        clusterColorTitle.className = styles.legendTitle;
        clusterColorTitle.style.cssText = 'color: #000 !important; margin: 0 0 3px 0 !important; font-size: 11px !important;';
        clusterColorLegend.appendChild(clusterColorTitle);
        
        // Add explanation text for edge case clusters
        const clusterExplanation = document.createElement('p');
        clusterExplanation.innerText = 'Colors = clusters\n+ = unclear (-1)\n● = others';
        clusterExplanation.style.cssText = 'color: #666 !important; margin: 0 0 6px 0 !important; font-size: 9px !important; line-height: 1.3 !important; white-space: pre-line !important;';
        clusterColorLegend.appendChild(clusterExplanation);
        
        // Create color scale for clusters using bottom plot colors
        const clusterColorScale = d3
          .scaleOrdinal<string, string>()
          .domain(clusterValues)
          .range(bottomPlot.colorScheme || PLOT_COLORS.BOTTOM);
        
        const clusterColorsList = document.createElement('ul');
        clusterColorsList.className = styles.legendList;
        clusterColorsList.style.cssText = 'list-style: none !important; padding: 0 !important; margin: 0 !important;';
        
        clusterValues.forEach(cluster => {
           const listItem = document.createElement('li');
           listItem.className = styles.legendItem;
           listItem.style.cssText = 'display: flex !important; align-items: center !important; margin-bottom: 3px !important;';
           
           const colorIndicator = document.createElement('span');
           colorIndicator.className = styles.legendColor;
           colorIndicator.style.cssText = `
             display: inline-block !important;
             width: 12px !important;
             height: 12px !important;
             background-color: ${clusterColorScale(cluster)} !important;
             margin-right: 8px !important;
             border-radius: 50% !important;
           `;
           
           const label = document.createElement('span');
           label.className = styles.legendLabel;
           label.innerText = `Cluster ${getClusterLetter(parseInt(cluster))}`;
           label.style.cssText = 'font-size: 10px !important; color: #000 !important;';
           
           listItem.appendChild(colorIndicator);
           listItem.appendChild(label);
           clusterColorsList.appendChild(listItem);
         });
        
        clusterColorLegend.appendChild(clusterColorsList);
        legendContainer.appendChild(clusterColorLegend);
      }
    }
    

    
    // Insert the legend directly into the container to ensure visibility
    if (containerRef.current) {
      containerRef.current.appendChild(legendContainer);
    }
    
  }, [topPlot.showSharedLegend, 
     showLegend, topPlot.data, 
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
      
      // Since users can now deselect by clicking the selected point,
      // we can optionally still support background clicks to deselect
      // but it's no longer necessary - comment out for cleaner UX
      // if (onPointClick && selectedPoint) {
      //   onPointClick(selectedPoint);
      // }
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
    colorScheme?: string[],
    isSingleMode: boolean = false,
    allPlotsData?: { topData?: DataPoint[], bottomData?: DataPoint[] }
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
      // Background clicks no longer deselect points since users can
      // click the selected point directly to deselect

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

    // Helper function to check if annotation represents -1
    const isNegativeOne = (annotation: string | number) => {
      return String(annotation).trim().startsWith('-1');
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

    // Create color scale based on what we're visualizing
    let colorScale: d3.ScaleOrdinal<string, string>;
    
    if (isTopPlot) {
      // Top plot: color by annotation values
      const allAnnotationValues = new Set<string>();
      
      // Add annotations from current plot
      data.forEach(d => allAnnotationValues.add(String(d.annotation)));
      
      // Add annotations from other plots to ensure consistent color mapping
      if (allPlotsData) {
        if (allPlotsData.topData && Array.isArray(allPlotsData.topData)) {
          allPlotsData.topData.forEach(d => allAnnotationValues.add(String(d.annotation)));
        }
        if (allPlotsData.bottomData && Array.isArray(allPlotsData.bottomData)) {
          allPlotsData.bottomData.forEach(d => allAnnotationValues.add(String(d.annotation)));
        }
      }
      
      const unifiedAnnotationValues = Array.from(allAnnotationValues).sort();
      colorScale = d3
        .scaleOrdinal<string, string>()
        .domain(unifiedAnnotationValues)
        .range(colorScheme || PLOT_COLORS.SINGLE);
    } else {
      // Bottom plot: color by cluster
      const allClusterValues = new Set<string>();
      data.forEach(d => allClusterValues.add(String(d.new_cluster_id)));
      
      const unifiedClusterValues = Array.from(allClusterValues).sort();
      colorScale = d3
        .scaleOrdinal<string, string>()
        .domain(unifiedClusterValues)
        .range(colorScheme || PLOT_COLORS.BOTTOM);
    }

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

      // X-axis title removed per user request

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

    // Create symbol generators
    const symbolCircle = d3.symbol().type(d3.symbolCircle);
    const symbolCross = d3.symbol().type(d3.symbolCross);

    // Add points
    pointsContainer
      .selectAll<SVGPathElement, DataPoint>("path")
      .data(data.filter(d => d && isFinite(d.pca_x) && isFinite(d.pca_y))) // Filter out invalid coordinates
      .join("path")
      .attr("d", d => {
        const size = getSizeFromConfidence(d.confidence);
        // Use different symbols based on annotation value
        if (isNegativeOne(d.annotation)) {
          return symbolCross.size(size)();
        } else {
          return symbolCircle.size(size)();
        }
      })
      .attr("transform", d => {
        return `translate(${xScale(d.pca_x)},${yScale(d.pca_y)})`;
      })
      .attr("fill", (d) => {
        // Color based on plot type
        if (isTopPlot) {
          // Top plot: color by annotation value
          const annotationValue = String(d.annotation);
          return colorScale(annotationValue);
        } else {
          // Bottom plot: color by cluster
          const clusterValue = String(d.new_cluster_id);
          return colorScale(clusterValue);
        }
      })
      .attr("class", (d) => {
        if (!d) return styles.point;
        
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
        if (!d) return "#555";
        
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
        if (!d) return 0.5;
        
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
        
        const isSelected = selectedPointData && d && (
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
          if (!d) return false;
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
          if (!d) return false;
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
      // Background clicks no longer needed for deselection since users can
      // click the selected point directly to deselect
    
    // Restore previous zoom state
    if (currentTransform.k !== 1) {
      svg.call(zoomRef.current.transform, currentTransform);
    }

    // Add clickable areas to improve selectability, but ensure they don't block zoom events
    g.selectAll<SVGCircleElement, DataPoint>(".hitArea")
      .data(data.filter(d => d && isFinite(d.pca_x) && isFinite(d.pca_y))) // Filter out invalid coordinates
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
        isSingleMode ? topPlot.colorScheme || PLOT_COLORS.SINGLE : topPlot.colorScheme,
        isSingleMode,
        // Pass all plots data for unified color mapping
        {
          topData: processedTopData,
          bottomData: processedBottomData
        }
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
        bottomPlot.colorScheme,
        isSingleMode,
        // Pass all plots data for unified color mapping
        {
          topData: processedTopData,
          bottomData: processedBottomData
        }
      );
    }
    
    // Render the shared legend after both plots are rendered
    setTimeout(() => {
      renderSharedLegend();
    }, 200); // Small delay to ensure plots are rendered first
  }, [dimensions, processedTopData, processedBottomData, topSelectedPoint, bottomSelectedPoint, 
     renderPlot, renderSharedLegend, isSingleMode, 
     topPlot.colorScheme, bottomPlot?.colorScheme,
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
            // Add null check for d
            if (!d) return false;
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
            // Add null check for d
            if (!d) return false;
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