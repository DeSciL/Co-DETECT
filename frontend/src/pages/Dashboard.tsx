import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { message, Tooltip } from "antd";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  DownOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import DualScatterPlot from "../components/DualScatterPlot";
import PointDetails from "../components/PointDetails";
import ClusteredPointDetails from "../components/ClusteredPointDetails";
import ClusterSummary from "../components/ClusterSummary";
import Modal from "../components/Modal";
import TourGuide from "../components/TourGuide";
import styles from "../styles/Dashboard.module.css";
import {
  DataPoint,
  AnnotationRequest,
  ClusterRequest,
  mapBackendDataToDataPoint,
} from "../types/data";
import { useDataContext } from "../hooks/useDataContext";
import { dataManager } from "../services/dataManager";
import { API_BASE_URL } from "../config/apiConfig";
import { getApiErrorMessage } from "../utils/errorHandling";

const Dashboard = () => {
  const { state, dispatch, batchUpdate } = useDataContext();
  const {
    annotations,
    previousAnnotations,
    improvementClusters,
    suggestions,
    savedSuggestions,
    previousGuidelines,
    requestBody,
    selectedPoint,
    isLoading,
    error,
    isDemoMode,
  } = state;

  // Local UI state
  const [selectionsEnabled, setSelectionsEnabled] = useState<boolean>(true);
  const [newLabel, setNewLabel] = useState("");
  const [isGuidelineExpanded, setIsGuidelineExpanded] = useState(true);
  const [isPreviousGuidelineExpanded, setIsPreviousGuidelineExpanded] =
    useState(false);
  const [expandedPreviousGuidelines, setExpandedPreviousGuidelines] = useState<{
    [key: number]: boolean;
  }>({});
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isExamplesExpanded, setIsExamplesExpanded] = useState(true);
  const [isImprovementsExpanded, setIsImprovementsExpanded] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(24);
  const [rightPanelWidth, setRightPanelWidth] = useState(32);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [iteratePreviewContent, setIteratePreviewContent] = useState("");
  const [showAddExampleModal, setShowAddExampleModal] = useState(false);
  const [newExampleText, setNewExampleText] = useState("");
  const [isReannotation, setIsReannotation] = useState(false);

  const navigate = useNavigate();

  // Debug function to check current state - accessible from browser console
  (window as unknown as { debugRoundState: () => void }).debugRoundState = () => {
    console.log("🔍 [ROUND STATE DEBUG] Current state inspection:", {
      requestBody,
      reannotateRound: requestBody?.reannotate_round,
      isDemoMode,
      annotations: annotations?.length,
      improvementClusters: improvementClusters?.length,
      timestamp: new Date().toISOString(),
    });
    
    // Also check saved data
    dataManager.loadData().then(savedData => {
      console.log("🔍 [ROUND STATE DEBUG] Saved data inspection:", {
        savedRequestData: savedData?.requestData,
        savedReannotateRound: savedData?.requestData?.reannotate_round,
        isDemoMode: savedData?.isDemoMode,
      });
    });
  };

  // Load data when component mounts
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!isMounted) return;

      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      try {
        const savedData = await dataManager.loadData();

        if (!isMounted) return;

        if (savedData) {
          console.log("🚀 [LOAD DATA DEBUG] Loading saved data:", {
            savedData,
            requestData: savedData.requestData,
            reannotateRound: savedData.requestData?.reannotate_round,
          });

          
          // Use batch update to prevent multiple re-renders
          // Create requestBody from savedData.requestData
          let requestBodyToSet: AnnotationRequest | null = null;
          if (savedData.requestData) {
            requestBodyToSet = {
              examples: savedData.requestData.examples || [],
              annotation_guideline: savedData.requestData.annotation_guideline || "",
              task_id: savedData.requestData.task_id || `task_${Date.now()}`, // Generate fallback task_id
              reannotate_round: savedData.requestData.reannotate_round || 0, // Use saved round value
            };
            
            console.log("🚀 [LOAD DATA DEBUG] Created requestBodyToSet:", requestBodyToSet);
          }

          
          batchUpdate({
            annotations: savedData.annotations || [],
            improvementClusters: savedData.improvement_clusters || [],
            suggestions: savedData.suggestions || {},
            savedSuggestions: savedData.savedSuggestions || {},
            requestBody: requestBodyToSet,
            previousAnnotations: savedData.previousAnnotations || [],
            previousGuidelines: savedData.previousGuidelines || [],
            isDemoMode: savedData.isDemoMode || false,
          });
        }
      } catch (error) {
        if (!isMounted) return;

        console.error("Error loading saved data:", error);
        dispatch({
          type: "SET_ERROR",
          payload: "Failed to load annotation data",
        });
        message.error("Failed to load saved data");
      } finally {
        if (isMounted) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [batchUpdate, dispatch]); // Add missing dependencies

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dataManager.cleanup();
    };
  }, []);

  // Memoized functions to prevent unnecessary re-renders
  const handlePointSelect = useCallback(
    (point: DataPoint) => {
      if (!selectionsEnabled) return;

      setSelectionsEnabled(false);

      const isSamePoint =
        selectedPoint &&
        ((selectedPoint.uid && point.uid && selectedPoint.uid === point.uid) ||
          selectedPoint.text_to_annotate === point.text_to_annotate);

      dispatch({
        type: "SET_SELECTED_POINT",
        payload: isSamePoint ? null : point,
      });

      // Check if the selected point is from improvementClusters data
      // If so, automatically expand the Suggested Edge Cases section
      if (!isSamePoint && point && improvementClusters && improvementClusters.length > 0) {
        const isFromImprovementClusters = improvementClusters.some(item => 
          (item.uid && point.uid && item.uid === point.uid) ||
          item.text_to_annotate === point.text_to_annotate
        );
        
        if (isFromImprovementClusters && !isImprovementsExpanded) {
          setIsImprovementsExpanded(true);
        }
      }

      setTimeout(() => {
        setSelectionsEnabled(true);
      }, 100);
    },
    [selectionsEnabled, selectedPoint, dispatch, improvementClusters, isImprovementsExpanded]
  );

  const handleBack = useCallback(async () => {
    try {
      await dataManager.clearData();
      navigate("/");
    } catch (error) {
      console.error("Error clearing data:", error);
      message.error("Failed to clear data");
    }
  }, [navigate]);

  // Function to handle iteration - shows confirmation modal first
  const handleIterate = useCallback(async () => {
    try {
      if (isDemoMode) {
        setIteratePreviewContent("");
        setShowIterateModal(true);
        return;
      }

      if (!requestBody?.examples || requestBody.examples.length === 0) {
        message.error("No examples available for annotation");
        return;
      }

      // Get current annotation guideline
      const currentGuideline = requestBody.annotation_guideline;
      let task = "";
      let labels: string[] = [];

      // Parse the current guideline (now always string format)
      const lines = currentGuideline.split("\n");
      task = lines[0].trim();
      labels = lines
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.trim().substring(1).trim());

      // Add saved suggestions to the guideline
      const savedSuggestionsText = Object.entries(savedSuggestions)
        .map(([, suggestion], index) => `${index + 1}. ${suggestion}`)
        .join("\n");

      // Extract the main task description (first line)
      const mainTask = task.split('\n')[0];
      
      // Filter labels to only include actual labels (typically short ones with numbers or simple descriptions)
      // Exclude long descriptive criteria
      const actualLabels = labels.filter(label => 
        // Keep labels that are short (like "0 (the post contains no hate speech)") 
        // or don't contain "Does the post" (which indicates they're criteria descriptions)
        label.length < 100 && !label.includes("Does the post")
      );
      
      // Build the detailed guidelines format for preview
      let combinedGuidelineString = `${mainTask}\n\nA post contains hate speech if it contains any of the following aspects:\n- Assaults on Human Dignity: Does the post demean or degrade individuals or groups based on race, ethnicity, gender, religion, sexual orientation, or other protected characteristics?\n- Calls for Violence: Does the post incite or encourage physical harm or violence against individuals or groups?\n- Vulgarity and/or Offensive Language: Does the post contain profanity, slurs, or other offensive language that may or may not be directed at individuals or groups?\n\nLabels:\n${actualLabels
        .map((label) => `- ${label}`)
        .join("\n")}`;

      if (savedSuggestionsText.trim()) {
        combinedGuidelineString += `\n\nEdge Case Handling:\n${savedSuggestionsText}`;
      }

      setIteratePreviewContent(combinedGuidelineString);
      setShowIterateModal(true);
    } catch (error) {
      console.error("Error preparing iteration:", error);
      message.error(
        "Failed to prepare iteration: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  }, [isDemoMode, requestBody, savedSuggestions]);

  // Function to perform actual iteration after confirmation
  const performIteration = useCallback(async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      setShowIterateModal(false);

      // Get current data
      const currentData = await dataManager.loadData();
      if (!currentData || !currentData.requestData) {
        throw new Error("No data available for iteration");
      }

      console.log("🔄 [ITERATE DEBUG] Current data from dataManager:", {
        requestData: currentData.requestData,
        currentRound: currentData.requestData?.reannotate_round,
      });
      console.log("🔄 [ITERATE DEBUG] Current requestBody from state:", {
        requestBody,
        currentRound: requestBody?.reannotate_round,
      });



      // Check if we're in demo mode
      if (currentData.isDemoMode && currentData.demoReannotationData) {
        console.log("🎭 [DEMO MODE DEBUG] Using demo mode iteration:", {
          isDemoMode: currentData.isDemoMode,
          demoReannotationData: currentData.demoReannotationData?.length,
          currentRequestData: currentData.requestData,
          currentRound: currentData.requestData?.reannotate_round,
        });
        
        // Use demo data - data is already mapped in validateAndCleanData
        const mappedAnnotations = currentData.demoReannotationData;
        const mappedImprovementClusters =
          currentData.demoReclusterData || currentData.improvement_clusters;
        const demoSuggestions =
          currentData.demoReclusterSuggestions || currentData.suggestions || {};



        // For demo mode, use the complete guideline with edge case handling
        let demoGuidelineString = "";
        try {
          const response = await fetch('/reannotation_guidelines.json');
          const data = await response.json();
          demoGuidelineString = data.guidelines;
        } catch (error) {
          console.error("Failed to load demo guidelines:", error);
          // Fallback to a basic guideline if file loading fails
          demoGuidelineString = "Please annotate if a social media post contains hate speech or not.\n\nLabels:\n- 0 (the post contains no hate speech)\n- 1 (the post contains hate speech)";
        }
        
        const updatedPreviousGuidelinesDemo = [
          ...(currentData.previousGuidelines || []),
          demoGuidelineString,
        ];
        
        console.log("🎭 [DEMO MODE DEBUG] Demo iteration data prepared:", {
          demoGuidelineString,
          updatedPreviousGuidelinesDemo: updatedPreviousGuidelinesDemo.length,
          willUpdateRequestBodyRound: "Demo mode doesn't update round for individual annotation",
        });

        // Save data using dataManager
        await dataManager.batchUpdate({
          previousAnnotations: currentData.annotations,
          previousImprovementClusters: currentData.improvement_clusters,
          previousSuggestions: currentData.suggestions,
          previousGuidelines: updatedPreviousGuidelinesDemo,
          annotations: mappedAnnotations,
          suggestions: demoSuggestions,
          improvement_clusters: mappedImprovementClusters,
          savedSuggestions: {},
        });

        // Update state using batch update
        batchUpdate({
          annotations: mappedAnnotations,
          suggestions: demoSuggestions,
          improvementClusters: mappedImprovementClusters,
          savedSuggestions: {},
          previousAnnotations: currentData.annotations,
          previousGuidelines: updatedPreviousGuidelinesDemo,
          selectedPoint: null, // Clear selected point after iteration
        });

        // IMPORTANT: Update requestBody with incremented round for demo mode too
        if (requestBody) {
          const currentRound = requestBody.reannotate_round || 0;
          const nextRound = currentRound + 1;
          
          console.log("🎭 [DEMO MODE DEBUG] Updating requestBody round:", {
            currentRound,
            nextRound,
            oldRequestBody: requestBody,
          });
          
          const updatedRequestBody: AnnotationRequest = {
            ...requestBody,
            reannotate_round: nextRound,
          };
          
          dispatch({ type: "SET_REQUEST_BODY", payload: updatedRequestBody });
          
          // Also save updated requestData to persistent storage for demo mode
          const updatedRequestData = {
            examples: updatedRequestBody.examples,
            annotation_guideline: updatedRequestBody.annotation_guideline,
            task_id: updatedRequestBody.task_id,
            reannotate_round: updatedRequestBody.reannotate_round,
            uploadMethod: (currentData.requestData as { uploadMethod?: "paste" | "upload" })?.uploadMethod || "paste",
          };
          
          console.log("🎭 [DEMO MODE DEBUG] Saving updated requestData for demo:", updatedRequestData);
          await dataManager.saveData({ requestData: updatedRequestData });
        }

        message.success(
          "Successfully iterated with demo reannotation and recluster data"
        );
        return;
      }

      // Original API-based iteration logic for non-demo mode
      // Get current annotation guideline
      const currentGuideline = currentData.requestData.annotation_guideline;
      let task = "";
      let labels: string[] = [];

      // Parse the current guideline (now always string format)
      const lines = currentGuideline.split("\n");
      // First line is the task (no "Task Description:" prefix)
      task = lines[0].trim();
      labels = lines
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.trim().substring(1).trim());

      // Add saved suggestions to the guideline only for API requests
      const savedSuggestionsText = Object.entries(savedSuggestions)
        .map(([, suggestion], index) => {
          return `${index + 1}. ${suggestion}`;
        })
        .join("\n");

      // Create combined guideline string only for API requests
      // Extract the main task description (first line)
      const mainTask = task.split('\n')[0];
      
      // Filter labels to only include actual labels (typically short ones with numbers or simple descriptions)
      // Exclude long descriptive criteria
      const actualLabels = labels.filter(label => 
        // Keep labels that are short (like "0 (the post contains no hate speech)") 
        // or don't contain "Does the post" (which indicates they're criteria descriptions)
        label.length < 100 && !label.includes("Does the post")
      );
      
      // Build the detailed guidelines format
      let combinedGuidelineString = `${mainTask}\n\nA post contains hate speech if it contains any of the following aspects:\n- Assaults on Human Dignity: Does the post demean or degrade individuals or groups based on race, ethnicity, gender, religion, sexual orientation, or other protected characteristics?\n- Calls for Violence: Does the post incite or encourage physical harm or violence against individuals or groups?\n- Vulgarity and/or Offensive Language: Does the post contain profanity, slurs, or other offensive language that may or may not be directed at individuals or groups?\n\nLabels:\n${actualLabels
        .map((label) => `- ${label}`)
        .join("\n")}`;

      if (savedSuggestionsText.trim()) {
        combinedGuidelineString += `\n\nEdge Case Handling:\n${savedSuggestionsText}`;
      }



      // Use original task_id instead of generating a new one
      const originalTaskId = currentData.requestData.task_id;
      if (!originalTaskId) {
        throw new Error("No task_id found in stored data");
      }
      
      // Get current round from requestBody, increment for iteration
      const currentRound = requestBody?.reannotate_round || 0;
      const nextRound = currentRound + 1;
      
      console.log("🔄 [ITERATE DEBUG] Round calculation:", {
        currentRound,
        nextRound,
        requestBodyRound: requestBody?.reannotate_round,
        originalTaskId,
      });
      
      const newRequest: AnnotationRequest = {
        examples: currentData.requestData.examples,
        annotation_guideline: combinedGuidelineString,
        task_id: originalTaskId, // Use original task_id
        reannotate_round: nextRound, // Use incremented round
      };

      console.log("🔄 [ITERATE DEBUG] New request for /annotate/:", newRequest);



      // Make API call to /annotate/
      const annotationResponse = await fetch(`${API_BASE_URL}/annotate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newRequest),
      });

      if (!annotationResponse.ok) {
        throw new Error(`HTTP error! Status: ${annotationResponse.status}`);
      }

      const annotationData = await annotationResponse.json();

      // Make API call to /cluster/
      const clusterRequestBody: ClusterRequest = {
        annotation_result: annotationData.annotations,
        annotation_guideline: combinedGuidelineString,
        task_id: originalTaskId, // Use originalTaskId instead of taskId
        reannotate_round: nextRound, // Use nextRound to match
      };

      const clusterResponse = await fetch(`${API_BASE_URL}/cluster/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clusterRequestBody),
      });

      if (!clusterResponse.ok) {
        throw new Error(`HTTP error! Status: ${clusterResponse.status}`);
      }

      const clusterData = await clusterResponse.json();

      // Map backend data to frontend format
      const mappedAnnotations = (annotationData.annotations || []).map(
        mapBackendDataToDataPoint
      );
      const mappedImprovementClusters = (clusterData.improvement_clusters || []).map(
        mapBackendDataToDataPoint
      );



      // Update previous guidelines list
      const updatedPreviousGuidelines = [
        ...(currentData.previousGuidelines || []),
        combinedGuidelineString,
      ];

      // Save data using dataManager
      await dataManager.batchUpdate({
        previousAnnotations: currentData.annotations,
        previousImprovementClusters: currentData.improvement_clusters,
        previousSuggestions: currentData.suggestions,
        previousGuidelines: updatedPreviousGuidelines,
        annotations: mappedAnnotations,
        suggestions: clusterData.suggestions || {},
        improvement_clusters: mappedImprovementClusters,
        savedSuggestions: {},
      });

      // Update state using batch update
      batchUpdate({
        annotations: mappedAnnotations,
        suggestions: clusterData.suggestions || {},
        improvementClusters: mappedImprovementClusters,
        savedSuggestions: {},
        previousAnnotations: currentData.annotations,
        previousGuidelines: updatedPreviousGuidelines,
        selectedPoint: null, // Clear selected point after iteration
      });

      // Update requestBody with new round to maintain consistency
      if (requestBody) {
        const updatedRequestBody: AnnotationRequest = {
          ...requestBody,
          reannotate_round: nextRound,
        };
        
        console.log("🔄 [ITERATE DEBUG] Updating requestBody with new round:", {
          oldRequestBody: requestBody,
          updatedRequestBody,
          nextRound,
        });
        
        dispatch({ type: "SET_REQUEST_BODY", payload: updatedRequestBody });
        
        // Also save updated requestData to persistent storage
        const updatedRequestData = {
          examples: updatedRequestBody.examples,
          annotation_guideline: updatedRequestBody.annotation_guideline,
          task_id: updatedRequestBody.task_id,
          reannotate_round: updatedRequestBody.reannotate_round,
          uploadMethod: (currentData.requestData as { uploadMethod?: "paste" | "upload" })?.uploadMethod || "paste",
        };
        
        console.log("🔄 [ITERATE DEBUG] Saving updated requestData to dataManager:", updatedRequestData);
        await dataManager.saveData({ requestData: updatedRequestData });
      }

      message.success("Successfully iterated annotation guideline");
    } catch (error) {
      console.error("Error during iteration:", error);
      
      // Use centralized error handling utility
      const errorMessage = getApiErrorMessage(error);
      message.error(errorMessage, 8); // Show error message for 8 seconds to ensure user sees it
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [dispatch, batchUpdate, savedSuggestions, requestBody]);

  // Handler for saving a suggestion
  const handleSaveSuggestion = useCallback(
    async (clusterNumber: number, suggestion: string) => {
      const newSuggestions = {
        ...savedSuggestions,
        [clusterNumber]: suggestion,
      };

      try {
        // Save to storage using dataManager
        await dataManager.saveData({ savedSuggestions: newSuggestions });

        // Update state
        dispatch({ type: "SET_SAVED_SUGGESTIONS", payload: newSuggestions });
      } catch (error) {
        console.error("Failed to save suggestions:", error);
        message.error("Failed to save suggestions");
      }
    },
    [savedSuggestions, dispatch]
  );

  // Handler for removing a suggestion
  const handleRemoveSuggestion = useCallback(
    async (clusterKey: string) => {
      const newSuggestions = { ...savedSuggestions };
      delete newSuggestions[clusterKey];

      try {
        // Save to storage using dataManager
        await dataManager.saveData({ savedSuggestions: newSuggestions });

        // Update state
        dispatch({ type: "SET_SAVED_SUGGESTIONS", payload: newSuggestions });
        
        message.success(`Successfully removed edge case handling rule`);
      } catch (error) {
        console.error("Failed to remove suggestion:", error);
        message.error("Failed to remove suggestion");
      }
    },
    [savedSuggestions, dispatch]
  );

  // Handler for editing a suggestion
  const handleEditSuggestion = useCallback(
    async (clusterKey: string, newSuggestion: string) => {
      const newSuggestions = {
        ...savedSuggestions,
        [clusterKey]: newSuggestion,
      };

      try {
        // Save to storage using dataManager
        await dataManager.saveData({ savedSuggestions: newSuggestions });

        // Update state
        dispatch({ type: "SET_SAVED_SUGGESTIONS", payload: newSuggestions });
        
        message.success(`Successfully updated edge case handling rule`);
      } catch (error) {
        console.error("Failed to edit suggestion:", error);
        message.error("Failed to update suggestion");
      }
    },
    [savedSuggestions, dispatch]
  );

  // Handler for saving all suggestions at once
  const handleSaveAllSuggestions = useCallback(async () => {
    if (!suggestions || Object.keys(suggestions).length === 0) {
      message.info("No suggestions available to save");
      return;
    }

    try {
      // Merge current saved suggestions with all available suggestions
      const newSuggestions = {
        ...savedSuggestions,
        ...suggestions,
      };

      // Save to storage using dataManager
      await dataManager.saveData({ savedSuggestions: newSuggestions });

      // Update state
      dispatch({ type: "SET_SAVED_SUGGESTIONS", payload: newSuggestions });
      
      const addedCount = Object.keys(suggestions).filter(
        key => !savedSuggestions[Number(key)]
      ).length;
      
      if (addedCount > 0) {
        message.success(`Successfully saved ${addedCount} suggestion${addedCount > 1 ? 's' : ''}`);
      } else {
        message.info("All suggestions are already saved");
      }
    } catch (error) {
      console.error("Failed to save all suggestions:", error);
      message.error("Failed to save all suggestions");
    }
  }, [suggestions, savedSuggestions, dispatch]);

  // Handler for adding a new example through manual input
  const handleShowAddExampleModal = useCallback(() => {
    setIsReannotation(false);
    setNewExampleText("");
    setShowAddExampleModal(true);
  }, []);

  // Handler for re-annotating an existing example
  const handleReannotateExample = useCallback((point: DataPoint) => {
    setIsReannotation(true);
    setNewExampleText(point.text_to_annotate);
    setShowAddExampleModal(true);
  }, []);

  // Handler for confirming add example (calls API)
  const handleConfirmAddExample = useCallback(async () => {
    if (!newExampleText.trim()) {
      message.error("Please enter text for the new example");
      return;
    }

    if (!requestBody) {
      message.error("No annotation guideline available");
      return;
    }

    try {
      dispatch({ type: "SET_LOADING", payload: true });
      setShowAddExampleModal(false);

      // Get the original task_id from stored data to ensure consistency
      const savedData = await dataManager.loadData();
      
      console.log("📝 [ADD EXAMPLE DEBUG] Starting add example process:", {
        currentRequestBody: requestBody,
        savedData: savedData?.requestData,
        isReannotation,
      });
      
      const originalTaskId = savedData?.requestData?.task_id || requestBody.task_id;
      
      if (!originalTaskId) {
        throw new Error("No task_id found in stored data. Please re-run the annotation from Home page.");
      }

      // Prepare request for single example annotation
      // Use the current round from requestBody (which should be the latest after iterate)
      // But also check savedData in case there's a sync issue
      const requestBodyRound = requestBody.reannotate_round || 0;
      const savedDataRound = savedData?.requestData?.reannotate_round || 0;
      const currentRound = Math.max(requestBodyRound, savedDataRound); // Use the higher value
      
      console.log("📝 [ADD EXAMPLE DEBUG] Round information:", {
        requestBodyRound: requestBody.reannotate_round,
        savedDataRound: savedData?.requestData?.reannotate_round,
        currentRound,
        originalTaskId,
        maxRoundLogic: `Math.max(${requestBodyRound}, ${savedDataRound}) = ${currentRound}`,
      });
      
      console.log("📝 [ADD EXAMPLE DEBUG] POTENTIAL ISSUE:", {
        roundMismatch: requestBodyRound !== savedDataRound,
        usingRequestBodyRound: requestBodyRound,
        usingSavedDataRound: savedDataRound,
        finalCurrentRound: currentRound,
      });
      
      const annotationRequest: AnnotationRequest = {
        examples: [newExampleText.trim()],
        annotation_guideline: requestBody.annotation_guideline,
        task_id: originalTaskId,
        reannotate_round: currentRound,
      };

      console.log("📝 [ADD EXAMPLE DEBUG] Annotation request being sent:", annotationRequest);

      // Call /annotate_one/ API
      const response = await fetch(`${API_BASE_URL}/annotate_one/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(annotationRequest),
      });

      console.log("📝 [ADD EXAMPLE DEBUG] API response status:", response.status);



      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data || !Array.isArray(data.annotations)) {
        throw new Error("Invalid response structure from API");
      }

      // Map backend data to frontend format
      const newAnnotations = (data.annotations || []).map(mapBackendDataToDataPoint);
      
      if (newAnnotations.length > 0) {
        const newAnnotation = newAnnotations[0]; // Should only have one item for annotate_one
        // Mark as reannotated
        newAnnotation.isReannotated = true;
        


        let updatedAnnotations: DataPoint[];
        const updatedImprovementClusters: DataPoint[] = [...improvementClusters];
        
        // Check if this annotation already exists in annotations (by uid or text)
        const existingIndex = annotations.findIndex(existing => 
          (existing.uid && newAnnotation.uid && existing.uid === newAnnotation.uid) ||
          existing.text_to_annotate === newAnnotation.text_to_annotate
        );
        
        // Check if this annotation exists in improvement clusters (by uid or text)
        const existingImprovementIndex = improvementClusters.findIndex(existing => 
          (existing.uid && newAnnotation.uid && existing.uid === newAnnotation.uid) ||
          existing.text_to_annotate === newAnnotation.text_to_annotate
        );
        


        if (existingIndex !== -1) {
          // Update existing annotation
          updatedAnnotations = [...annotations];
          updatedAnnotations[existingIndex] = newAnnotation;
          message.success("Successfully re-annotated existing example");
        } else {
          // Add new annotation
          updatedAnnotations = [...annotations, newAnnotation];
          message.success("Successfully annotated and added new example");
        }

        // Also update the same point in improvement clusters if it exists there
        if (existingImprovementIndex !== -1) {
          // Get edge case coordinates from the API response
          const apiResponse = data.annotations[0]; // Original API response data
          const edgeCasePcaX = apiResponse?.edge_case_pca_x;
          const edgeCasePcaY = apiResponse?.edge_case_pca_y;
          
          // Create updated improvement cluster point
          const updatedImprovementPoint = {
            ...newAnnotation,
            // Use edge_case_pca coordinates for improvement clusters positioning
            pca_x: edgeCasePcaX !== undefined && edgeCasePcaX !== null ? edgeCasePcaX : improvementClusters[existingImprovementIndex].pca_x,
            pca_y: edgeCasePcaY !== undefined && edgeCasePcaY !== null ? edgeCasePcaY : improvementClusters[existingImprovementIndex].pca_y,
          };
          
          updatedImprovementClusters[existingImprovementIndex] = updatedImprovementPoint;
        }

        // Save to storage using dataManager
        await dataManager.saveData({ 
          annotations: updatedAnnotations,
          improvement_clusters: updatedImprovementClusters
        });

        // Update state
        dispatch({ type: "SET_ANNOTATIONS", payload: updatedAnnotations });
        dispatch({ type: "SET_IMPROVEMENT_CLUSTERS", payload: updatedImprovementClusters });
        
        setNewExampleText("");
      } else {
        throw new Error("No annotation data received");
      }
    } catch (error) {
      console.error("Error adding new example:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      
      // Use centralized error handling utility
      const errorMessage = getApiErrorMessage(error);
      message.error(errorMessage, 8); // Show error message for 8 seconds to ensure user sees it
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [newExampleText, requestBody, annotations, improvementClusters, dispatch, isReannotation]);

  // Handler for adding a new example (legacy function for backward compatibility)
  const handleAddExample = useCallback(
    async (example: Partial<DataPoint>) => {
      if (!example.text_to_annotate || example.text_to_annotate.trim() === "") {
        return;
      }

      // Create a new example with default values
      const newExample: DataPoint = {
        text_to_annotate: example.text_to_annotate,
        new_cluster_id: 0, // Default cluster
        pca_x: 0,
        pca_y: 0,
        raw_annotations: "",
        analyses: "User added example",
        annotation: 0, // Default as not hate speech
        confidence: 50, // Default confidence
        new_edge_case: false, // Default as not an edge case
        guideline_improvement: "",
        uid: `user-${Math.random().toString(36).substring(2, 9)}`,
      };

      const newAnnotations = [...annotations, newExample];

      try {
        // Save to storage using dataManager
        await dataManager.saveData({ annotations: newAnnotations });

        // Update state
        dispatch({ type: "SET_ANNOTATIONS", payload: newAnnotations });
      } catch (error) {
        console.error("Failed to update data with new example:", error);
        message.error("Failed to add new example");
      }
    },
    [annotations, dispatch]
  );

  // Use improvement_clusters as the complaints data
  const complaintsData = improvementClusters;

  // Function to add a new label
  const handleAddLabel = useCallback(() => {
    if (!newLabel.trim() || !requestBody) return;

    // Since annotation_guideline is always a string, parse it first
    const task = getTaskFromGuideline(requestBody.annotation_guideline);
    const labels = getLabelsFromGuideline(requestBody.annotation_guideline);

    // Create new guideline string with added label
    const newLabels = [...labels, newLabel.trim()];
    const newGuidelineString = `${task}\n\nLabels:\n${newLabels.map(l => `- ${l}`).join('\n')}\n`;

    const updatedRequestBody: AnnotationRequest = {
      ...requestBody,
      annotation_guideline: newGuidelineString,
    };

    // Save to storage and update state
    try {
      const updatedData = {
        examples: updatedRequestBody.examples,
        annotation_guideline: updatedRequestBody.annotation_guideline,
        task_id: updatedRequestBody.task_id,
        reannotate_round: updatedRequestBody.reannotate_round,
        uploadMethod: ((
          requestBody as AnnotationRequest & { uploadMethod?: string }
        ).uploadMethod || "paste") as "paste" | "upload",
      };
      dataManager.saveData({ requestData: updatedData });
      dispatch({ type: "SET_REQUEST_BODY", payload: updatedRequestBody });
      setNewLabel("");
    } catch (error) {
      console.error("Failed to save label:", error);
      message.error("Failed to add label");
    }
  }, [newLabel, requestBody, dispatch]);

  // Function to remove a label
  const handleRemoveLabel = (index: number) => {
    if (!requestBody) return;

    // Since annotation_guideline is always a string, parse it first
    const task = getTaskFromGuideline(requestBody.annotation_guideline);
    const labels = getLabelsFromGuideline(requestBody.annotation_guideline)
      .filter((_, i) => i !== index);

    // Create new guideline string with removed label
    const newGuidelineString = `${task}\n\nLabels:\n${labels.map(l => `- ${l}`).join('\n')}\n`;

    const updatedRequestBody: AnnotationRequest = {
      ...requestBody,
      annotation_guideline: newGuidelineString,
    };

    // Save to storage and update state
    try {
      const updatedData = {
        examples: updatedRequestBody.examples,
        annotation_guideline: updatedRequestBody.annotation_guideline,
        task_id: updatedRequestBody.task_id,
        reannotate_round: updatedRequestBody.reannotate_round,
        uploadMethod: ((
          requestBody as AnnotationRequest & { uploadMethod?: string }
        ).uploadMethod || "paste") as "paste" | "upload",
      };
      dataManager.saveData({ requestData: updatedData });
      dispatch({ type: "SET_REQUEST_BODY", payload: updatedRequestBody });
    } catch (error) {
      console.error("Failed to remove label:", error);
      message.error("Failed to remove label");
    }
  };

  // Function to update task description
  const handleUpdateTask = useCallback((newTask: string) => {
    if (!requestBody) return;

    // Since annotation_guideline is always a string, parse it first
    const labels = getLabelsFromGuideline(requestBody.annotation_guideline);

    // Create new guideline string with updated task
    const newGuidelineString = `${newTask}\n\nLabels:\n${labels.map(l => `- ${l}`).join('\n')}\n`;

    const updatedRequestBody: AnnotationRequest = {
      ...requestBody,
      annotation_guideline: newGuidelineString,
    };

    // Save to storage and update state
    try {
      const updatedData = {
        examples: updatedRequestBody.examples,
        annotation_guideline: updatedRequestBody.annotation_guideline,
        task_id: updatedRequestBody.task_id,
        reannotate_round: updatedRequestBody.reannotate_round,
        uploadMethod: ((
          requestBody as AnnotationRequest & { uploadMethod?: string }
        ).uploadMethod || "paste") as "paste" | "upload",
      };
      dataManager.saveData({ requestData: updatedData });
      dispatch({ type: "SET_REQUEST_BODY", payload: updatedRequestBody });
    } catch (error) {
      console.error("Failed to update task:", error);
      message.error("Failed to update task");
    }
  }, [requestBody, dispatch]);

  // Helper function to parse task from annotation_guideline
  const getTaskFromGuideline = (guideline: string): string => {
    // Split by "Labels:" and take everything before it as task description
    const parts = guideline.split(/\nLabels:\n/);
    return parts[0]?.trim() || "";
  };

  // Helper function to parse labels from annotation_guideline
  const getLabelsFromGuideline = (guideline: string): string[] => {
    // Split by "Labels:" and only parse lines after it
    const parts = guideline.split(/\nLabels:\n/);
    if (parts.length < 2) return [];
    
    const labelsSection = parts[1];
    return labelsSection
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.trim().substring(1).trim())
      .filter((label) => label.length > 0);
  };

  // Function to toggle previous guideline expansion
  const togglePreviousGuideline = useCallback((index: number) => {
    setExpandedPreviousGuidelines((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }, []);

  // Add resize handlers
  const handleMouseDown = (e: React.MouseEvent, panel: "left" | "right") => {
    e.preventDefault();
    setIsResizing(true);
    document.body.classList.add("resizing");

    const startX = e.pageX;
    const startLeftWidth = leftPanelWidth;
    const startRightWidth = rightPanelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.pageX - startX;
      const containerWidth = window.innerWidth - 32; // Account for padding

      if (panel === "left") {
        const newWidth = Math.max(
          20,
          Math.min(40, startLeftWidth + (deltaX / containerWidth) * 100)
        );
        setLeftPanelWidth(newWidth);
      } else {
        const newWidth = Math.max(
          30,
          Math.min(50, startRightWidth - (deltaX / containerWidth) * 100)
        );
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading annotation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h2>Error Loading Data</h2>
        <p>{error}</p>
        <button className={styles.backButton} onClick={handleBack}>
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.dashboard} ${isResizing ? styles.resizing : ""}`}>
      <TourGuide page="dashboard" />

      {/* Iterate Confirmation Modal */}
      <Modal
        isOpen={showIterateModal}
        onClose={() => setShowIterateModal(false)}
        title={isDemoMode ? "Load Demo Reannotation Data" : "Confirm Iteration"}
        onConfirm={performIteration}
        confirmText={isDemoMode ? "Load Reannotation Data" : "Iterate"}
        cancelText="Cancel"
      >
        {isDemoMode ? (
          <div className={styles.modalIntroText}>
            <p className={styles.modalMainText}>
              Click the button below to load the demo reannotation data.
            </p>
            <p className={styles.modalSubText}>
              This will simulate the iteration process using pre-loaded demo
              data without making any API calls.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.modalIntroText}>
              <p className={styles.modalMainText}>
                The following annotation guideline will be sent to the API for
                re-annotation and re-clustering:
              </p>
              <p className={styles.modalSubText}>
                If you want to make changes, please cancel and modify the
                "Current Guidelines" and "Edge Case Handling" sections in the
                dashboard.
              </p>
            </div>
            <div className={styles.modalPreviewContent}>
              {iteratePreviewContent}
            </div>
          </>
        )}
      </Modal>

      {/* Add Example Modal */}
      <Modal
        isOpen={showAddExampleModal}
        onClose={() => {
          setShowAddExampleModal(false);
          setNewExampleText("");
          setIsReannotation(false);
        }}
        title={isReannotation ? "Re-annotate Example" : "Add New Example"}
        onConfirm={handleConfirmAddExample}
        confirmText={isReannotation ? "Re-annotate" : "Annotate & Add"}
        cancelText="Cancel"
      >
        <div className={styles.modalIntroText}>
          <p className={styles.modalMainText}>
            {isReannotation 
              ? "Re-annotate this example using the current guidelines."
              : "Enter a new text example to be annotated and added to the dataset."
            }
          </p>
          <p className={styles.modalSubText}>
            {isReannotation
              ? "This example will be sent to the annotation API and re-annotated using the current guidelines. The result will replace the existing annotation."
              : "This example will be sent to the annotation API and automatically annotated using the current guidelines, then added to the scatter plot visualization."
            }
          </p>
        </div>
        <div className={styles.addExampleForm}>
          <label htmlFor="newExampleInput" className={styles.formLabel}>
            Enter text to annotate:
          </label>
          <textarea
            id="newExampleInput"
            className={styles.formTextarea}
            value={newExampleText}
            onChange={(e) => setNewExampleText(e.target.value)}
            placeholder="Enter your text example here..."
            rows={4}
          />
        </div>
      </Modal>

      <div
        ref={leftPanelRef}
        className={styles.guidelinesPanel}
        style={{ flex: `0 0 ${leftPanelWidth}%` }}
      >
        <div className={styles.panelHeader}>
          <Tooltip title="Apply current annotation guidelines and edge case handling rules to re-annotate and re-cluster">
            <button
              className={styles.iterateButton}
              onClick={handleIterate}
              data-tour="iterate-button"
            >
              Iterate
            </button>
          </Tooltip>
        </div>
        <div className={styles.splitPanels}>
          {/* Previous Guidelines Section */}
          <div
            className={`${styles.guidelineSection} ${
              isPreviousGuidelineExpanded ? styles.expanded : styles.collapsed
            }`}
            data-tour="previous-guidelines"
          >
            <div className={styles.sectionHeader}>
              {isPreviousGuidelineExpanded ? (
                <CaretDownOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() =>
                    setIsPreviousGuidelineExpanded(!isPreviousGuidelineExpanded)
                  }
                />
              ) : (
                <CaretRightOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() =>
                    setIsPreviousGuidelineExpanded(!isPreviousGuidelineExpanded)
                  }
                />
              )}
              <h2>Previous Guidelines</h2>
            </div>
            {isPreviousGuidelineExpanded && (
              <div className={styles.guidelinesContent}>
                {previousGuidelines && previousGuidelines.length > 0 ? (
                  previousGuidelines.map((guide, idx) => {
                    const isExpanded = expandedPreviousGuidelines[idx];

                    return (
                      <div key={idx} className={styles.previousGuidelineItem}>
                        <div
                          className={styles.previousGuidelineHeader}
                          onClick={() => togglePreviousGuideline(idx)}
                        >
                          <span className={styles.previousGuidelineTitle}>
                            Round {idx + 1}
                          </span>
                          <div className={styles.previousGuidelineExpandIcon}>
                            <DownOutlined
                              className={`${styles.previousGuidelineChevron} ${
                                isExpanded ? styles.expanded : ""
                              }`}
                            />
                          </div>
                        </div>
                        {isExpanded && (
                          <div className={styles.previousGuidelineContent}>
                            <pre className={styles.previousGuidelineText}>
                              {guide}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>
                    <p>No previous guidelines available</p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Annotation Guidelines Section */}
          <div
            className={`${styles.guidelineSection} ${
              isGuidelineExpanded ? styles.expanded : styles.collapsed
            }`}
            data-tour="annotation-guidelines"
          >
            <div className={styles.sectionHeader}>
              {isGuidelineExpanded ? (
                <CaretDownOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsGuidelineExpanded(!isGuidelineExpanded)}
                />
              ) : (
                <CaretRightOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsGuidelineExpanded(!isGuidelineExpanded)}
                />
              )}
              <h2>Current Guidelines</h2>
            </div>
            {isGuidelineExpanded && (
              <div className={styles.guidelinesContent}>
                {requestBody ? (
                  <>
                    <h3 className={styles.guidelineHeader}>Task Description</h3>
                    <textarea
                      className={styles.taskInput}
                      value={
                        requestBody?.annotation_guideline
                          ? getTaskFromGuideline(requestBody.annotation_guideline)
                          : ""
                      }
                      onChange={(e) => {
                        handleUpdateTask(e.target.value);
                      }}
                    />

                    <h3 className={styles.guidelineHeader}>Labels</h3>
                    <div className={styles.criteriaList}>
                      {(requestBody?.annotation_guideline
                        ? getLabelsFromGuideline(requestBody.annotation_guideline)
                        : []
                      ).map((label: string, index: number) => (
                        <div key={index} className={styles.criterionItem}>
                          <span>{label}</span>
                          <button
                            className={styles.removeCriterionButton}
                            onClick={() => handleRemoveLabel(index)}
                            aria-label="Remove label"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className={styles.addCriterionContainer}>
                      <input
                        type="text"
                        className={styles.criterionInput}
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="Add new label..."
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleAddLabel();
                          }
                        }}
                      />
                      <button
                        className={styles.addCriterionButton}
                        onClick={handleAddLabel}
                        disabled={!newLabel.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <p>No current guidelines available</p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Cluster Summary Section */}
          <div
            className={`${styles.summarySection} ${
              isSummaryExpanded ? styles.expanded : styles.collapsed
            }`}
            data-tour="edge-case-handling"
          >
            <div className={styles.sectionHeader}>
              {isSummaryExpanded ? (
                <CaretDownOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                />
              ) : (
                <CaretRightOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                />
              )}
              <h2>Edge Case Handling</h2>
            </div>
            {isSummaryExpanded && (
              <div className={styles.clusterSummaryContainer}>
                <ClusterSummary
                  savedSuggestions={savedSuggestions}
                  onRemoveSuggestion={handleRemoveSuggestion}
                  onEditSuggestion={handleEditSuggestion}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Panel - Scatter Plot */}
      <div className={`${styles.centerPanel} ${styles.withDualPlots}`}>
        <div
          className={styles.resizeHandle}
          onMouseDown={(e) => handleMouseDown(e, "left")}
        >
          <div className={styles.resizeIcon}>≡</div>
        </div>
        <div className={styles.panelHeader}>
          <button className={styles.backButton} onClick={handleBack}>
            Edit Inputs
          </button>
          <h2>Cluster Analysis</h2>
        </div>
        <div className={styles.scatterPlotContainer} data-tour="scatter-plot">
          <div
            data-tour="upper-scatter-plot"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              pointerEvents: "none",
            }}
          ></div>
          <div
            data-tour="lower-scatter-plot"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "50%",
              pointerEvents: "none",
            }}
          ></div>
          {annotations && annotations.length > 0 ? (
            <DualScatterPlot
              topPlot={{
                data: annotations,
                showSharedLegend: true,
                showClusterLegend: true,
                forcedAxes: true,
                clusterPrefix: "", // Use empty prefix
                // Custom function to map cluster IDs from 0-based to 1-based in the color scale
                colorScheme: [
                  "#1f77b4",
                  "#ff7f0e",
                  "#2ca02c",
                  "#d62728",
                  "#9467bd",
                  "#8c564b",
                  "#e377c2",
                  "#7f7f7f",
                  "#bcbd22",
                  "#17becf",
                ], // Blue color scheme
              }}
              bottomPlot={{
                data: improvementClusters,
                showSharedLegend: false,
                showClusterLegend: true,
                forcedAxes: true,
                clusterPrefix: "", // Empty prefix, will use letter conversion
                colorScheme: [
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
                ], // Different color scheme
              }}
              onPointClick={handlePointSelect}
              selectedPoint={selectedPoint}
            />
          ) : improvementClusters && improvementClusters.length > 0 ? (
            <div className={styles.noDataMessage}>
              <p>
                No annotation data available. Please submit text for annotation.
              </p>
            </div>
          ) : (
            <div className={styles.noDataMessage}>
              <p>No data available. Please submit text or file for analysis.</p>
            </div>
          )}
        </div>
        <div
          className={styles.resizeHandle}
          onMouseDown={(e) => handleMouseDown(e, "right")}
        >
          <div className={styles.resizeIcon}>≡</div>
        </div>
      </div>

      {/* Right Panel - Details */}
      <div
        ref={rightPanelRef}
        className={styles.rightPanel}
        style={{ flex: `0 0 ${rightPanelWidth}%` }}
      >
        <div className={styles.splitDetailsContainer}>
          {/* All Examples Section */}
          <div
            className={`${styles.detailsSection} ${
              isExamplesExpanded ? styles.expanded : styles.collapsed
            }`}
            data-tour="all-examples"
          >
            <div className={styles.sectionHeader}>
              {isExamplesExpanded ? (
                <CaretDownOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsExamplesExpanded(!isExamplesExpanded)}
                />
              ) : (
                <CaretRightOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() => setIsExamplesExpanded(!isExamplesExpanded)}
                />
              )}
              <h2>All Examples</h2>
              <div className={styles.headerActions}>
                <Tooltip title="Add new example for annotation">
                  <button
                    className={styles.addExampleButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowAddExampleModal();
                    }}
                    aria-label="Add new example"
                  >
                    <PlusOutlined style={{ fontSize: "14px" }} />
                  </button>
                </Tooltip>
              </div>
            </div>
            {isExamplesExpanded && (
              <div className={styles.detailsContainer}>
                <PointDetails
                  point={selectedPoint}
                  data={annotations}
                  onPointSelect={handlePointSelect}
                  onAddExample={handleAddExample}
                  previousAnnotations={previousAnnotations}
                  onReannotate={handleReannotateExample}
                />
              </div>
            )}
          </div>

          {/* Improvement Suggestions Section */}
          <div
            className={`${styles.detailsSection} ${
              isImprovementsExpanded ? styles.expanded : styles.collapsed
            }`}
            data-tour="suggested-edge-cases"
          >
            <div className={styles.sectionHeader}>
              {isImprovementsExpanded ? (
                <CaretDownOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() =>
                    setIsImprovementsExpanded(!isImprovementsExpanded)
                  }
                />
              ) : (
                <CaretRightOutlined
                  className={styles.expandIcon}
                  style={{ fontSize: "14px", marginRight: "8px" }}
                  onClick={() =>
                    setIsImprovementsExpanded(!isImprovementsExpanded)
                  }
                />
              )}
              <h2>Suggested Edge Cases</h2>
              <div className={styles.headerActions}>
                <button
                  className={styles.resetButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveAllSuggestions();
                  }}
                  aria-label="Save all suggestions"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Add All
                </button>
                <button
                  className={styles.resetButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    const collapseButton = document.querySelector(
                      ".improvementCollapseButton"
                    );
                    if (collapseButton) {
                      (collapseButton as HTMLButtonElement).click();
                    }
                  }}
                  aria-label="Collapse all clusters"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Collapse All
                </button>
              </div>
            </div>
            {isImprovementsExpanded && (
              <div className={styles.detailsContainer}>
                <ClusteredPointDetails
                  point={selectedPoint}
                  data={complaintsData}
                  onPointSelect={handlePointSelect}
                  suggestions={suggestions}
                  onSaveSuggestion={handleSaveSuggestion}
                  savedSuggestions={savedSuggestions}
                  previousAnnotations={previousAnnotations}
                  onReannotate={handleReannotateExample}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
