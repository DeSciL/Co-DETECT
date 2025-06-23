import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Card, 
  Input, 
  Button, 
  Upload, 
  Typography, 
  Spin,
  message,
  Tooltip
} from 'antd';
import { 
  UploadOutlined, 
  PlusOutlined,
  LoadingOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import styles from "../styles/Home.module.css";
import { AnnotationRequest, DataPoint, mapBackendDataToDataPoint, parseReclusterResponse } from "../types/data";
import { API_BASE_URL } from "../config/apiConfig";
import { dataManager } from "../services/dataManager";
import TourGuide from "../components/TourGuide";
import StepIndicator from "../components/StepIndicator";

const { TextArea } = Input;
const { Title, Text } = Typography;

const Home = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [task, setTask] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [textToAnnotate, setTextToAnnotate] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"paste" | "upload">("paste");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState("grc_rnd");
  const navigate = useNavigate();
  
  // Get annotation_guideline from task and labels
  const getAnnotationGuideline = (): string => {
    // Build the guideline string in the exact same format as the backend test script
    let guidelineText = `${task}\n\nLabels:\n`;

    if (labels.length > 0) {
      guidelineText += labels.map(l => `- ${l}`).join('\n');
    }

    // Ensure there is a trailing newline to match the backend constant exactly
    if (!guidelineText.endsWith('\n')) {
      guidelineText += '\n';
    }

    return guidelineText;
  };
  
  // Load default guidelines from guidelines.json and data from IndexedDB when component mounts
  useEffect(() => {
    // First load default guidelines from public/guidelines.json
    fetch('/guidelines.json')
      .then(response => response.json())
      .then(data => {
        setTask(data.task || "");
        setLabels(data.labels || []);
      })
      .catch(error => {
        console.error("Error loading guidelines.json:", error);
      });
    
    // Then check IndexedDB for any saved data
    const loadSavedData = async () => {
      try {
        const savedData = await dataManager.loadData();
        
        if (savedData) {
          // Use stored task and labels directly
          if (savedData.requestData) {
            // Since annotation_guideline is always a string, parse it to extract task and labels
            if (savedData.requestData.annotation_guideline && typeof savedData.requestData.annotation_guideline === "string") {
              // Split by "Labels:" and take everything before it as task description
              const parts = savedData.requestData.annotation_guideline.split(/\nLabels:\n/);
              const task = parts[0]?.trim() || "";
              
              // Parse labels only from the section after "Labels:"
              let labels: string[] = [];
              if (parts.length >= 2) {
                const labelsSection = parts[1];
                labels = labelsSection
                  .split("\n")
                  .filter((line) => line.trim().startsWith("-"))
                  .map((line) => line.trim().substring(1).trim())
                  .filter((label) => label.length > 0);
              }
              
              if (task) setTask(task);
              if (labels.length > 0) setLabels(labels);
            }
            
            // If there were examples, join them back for the textarea
            if (Array.isArray(savedData.requestData.examples)) {
              setTextToAnnotate(savedData.requestData.examples.join('\n\n'));
            }
            
            // If upload method was stored
            if (savedData.requestData.uploadMethod) {
              setUploadMethod(savedData.requestData.uploadMethod);
            }
          }
        }
      } catch (error) {
        console.error("Error loading saved data:", error);
        message.error("Failed to load saved data");
      }
    };

    loadSavedData();
  }, []);
  
  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split('\n');
      
      if (lines.length < 2) {
        setParseError("CSV file must have at least a header row and one data row");
        return;
      }
      
      // Use a more permissive parsing for the header to find the text_to_annotate column
      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
      const textColumnIndex = headers.indexOf("text_to_annotate");
      
      if (textColumnIndex === -1) {
        setParseError("CSV file must contain a column named 'text_to_annotate'");
        return;
      }
      
      // Extract texts from the text column
      const examples = lines.slice(1)
        .filter(line => line.trim() !== '')
        .map(line => {
          try {
            // For each line, we'll extract the text column which may be quoted or not
            const columns = parseCSVLine(line);
            let text = columns[textColumnIndex]?.trim() || "";
            
            // Clean invalid control characters from the text
            const controlChars = Array.from({length: 32}, (_, i) => String.fromCharCode(i))
              .filter(char => char !== '\t' && char !== '\n' && char !== '\r');
            
            for (const char of controlChars) {
              if (text.includes(char)) {
                text = text.replace(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
              }
            }
            
            return text;
          } catch (error) {
            console.error("Error parsing CSV line:", line, error);
            return ""; // Return empty string for problematic lines
          }
        })
        .filter(text => text !== "");
      

      
      setTextToAnnotate(examples.join('\n\n'));
    };
    reader.readAsText(file);
  };
  
  // Helper function to properly parse CSV lines with quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let currentField = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      // Check for beginning or end of quoted field
      if (char === '"') {
        // If this is an escaped quote (double quote) inside a quoted field
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          currentField += '"'; // Add a single quote to the field
          i++; // Skip the next quote
        } else {
          // Toggle the quote state
          inQuotes = !inQuotes;
          // We don't add the quote character to the field value
        }
      }
      // Check for field separator (comma)
      else if (char === ',' && !inQuotes) {
        result.push(currentField);
        currentField = "";
      }
      // Add any other character to the current field
      else {
        currentField += char;
      }
    }
    
    // Add the last field
    result.push(currentField);
    return result;
  };
  
  const handleFileChange = (files: FileList | null) => {
    setParseError(null);
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setFiles(fileArray);
      
      const file = fileArray[0];
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      // Auto-suggest task_id from filename if not already set
      if (!taskId.trim()) {
        const rawName = file.name;
        const dotIndex = rawName.lastIndexOf(".");
        const suggestedTaskId = dotIndex > 0 ? rawName.substring(0, dotIndex) : rawName;
        setTaskId(suggestedTaskId);
      }
      
      if (fileExtension === "csv") {
        processCsvFile(file);
      } else {
        setParseError("Only CSV files are supported");
      }
    }
  };
  
  const handleSubmit = async () => {
    // Reset any previous errors
    setApiError(null);
    
    // Clear previously saved data
    await dataManager.clearData();
    
    // Convert text to annotate into an array of examples
    const examples = textToAnnotate
      .split(/\n\s*\n|\r\n\s*\r\n/)  // Split by empty lines
      .map(text => text.trim())
      .filter(text => text !== "");
    
    // Combine task and labels into annotation_guideline
    const annotation_guideline = getAnnotationGuideline();
    
    // Use user-provided task_id instead of generating one
    const finalTaskId = taskId.trim() || `annotation_task_${Date.now()}`; // Fallback if empty

    // Prepare the request body for annotation
    const annotationRequestBody: AnnotationRequest = {
      examples,
      annotation_guideline,
      task_id: finalTaskId,
      reannotate_round: 0,  // Initial annotation
    };
    
    // Set loading state
    setIsLoading(true);
    
    try {
      // First API call to /annotate/
      
      const annotationResponse = await fetch(`${API_BASE_URL}/annotate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(annotationRequestBody),
      });
      
      if (!annotationResponse.ok) {
        const errorText = await annotationResponse.text();
        console.error("Annotation API error response:", errorText);
        throw new Error(`HTTP error! Status: ${annotationResponse.status} - ${errorText}`);
      }
      
      // Get response as text first to check for invalid characters
      const responseText = await annotationResponse.text();
      
      // Check for and remove invalid control characters (excluding normal whitespace like \t, \n, \r)
      // Use String.fromCharCode to avoid linter issues with control characters in regex
      const controlChars = Array.from({length: 32}, (_, i) => String.fromCharCode(i))
        .filter(char => char !== '\t' && char !== '\n' && char !== '\r');
      
      let cleanedResponse = responseText;
      let hasInvalidChars = false;
      
      for (const char of controlChars) {
        if (responseText.includes(char)) {
          hasInvalidChars = true;
          cleanedResponse = cleanedResponse.replace(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
        }
      }
      
      if (hasInvalidChars) {
        console.warn("Found and removed invalid control characters from response");
      }
      
      const annotationData = JSON.parse(cleanedResponse);
      
      // Validate annotation response structure
      if (!annotationData || !Array.isArray(annotationData.annotations)) {
        console.error("Invalid annotation response structure:", annotationData);
        throw new Error("Invalid response from annotation API - missing or invalid annotations array");
      }
      
      // Second API call to /cluster/
      const clusterRequestBody = {
        annotation_result: annotationData.annotations,
        annotation_guideline,
        task_id: finalTaskId,
        reannotate_round: 0,  // Initial annotation
      };
      
      const clusterResponse = await fetch(`${API_BASE_URL}/cluster/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(clusterRequestBody),
      });
      
      if (!clusterResponse.ok) {
        const errorText = await clusterResponse.text();
        console.error("Cluster API error response:", errorText);
        throw new Error(`HTTP error! Status: ${clusterResponse.status} - ${errorText}`);
      }
      
      // Get cluster response as text first to check for invalid characters
      const clusterResponseText = await clusterResponse.text();
      
      // Clean invalid control characters from cluster response
      const controlCharsCluster = Array.from({length: 32}, (_, i) => String.fromCharCode(i))
        .filter(char => char !== '\t' && char !== '\n' && char !== '\r');
      
      let cleanedClusterResponse = clusterResponseText;
      let hasInvalidCharsCluster = false;
      
      for (const char of controlCharsCluster) {
        if (clusterResponseText.includes(char)) {
          hasInvalidCharsCluster = true;
          cleanedClusterResponse = cleanedClusterResponse.replace(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
        }
      }
      
      if (hasInvalidCharsCluster) {
        console.warn("Found and removed invalid control characters from cluster response");
      }
      
      const clusterData = JSON.parse(cleanedClusterResponse);
      
      // Handle different possible response structures
      let improvementClusters: unknown[] = [];
      let suggestions: Record<string, string> = {};
      
      if (Array.isArray(clusterData)) {
        // If response is an array [suggestions, improvement_clusters]
        if (clusterData.length >= 2) {
          suggestions = clusterData[0] || {};
          improvementClusters = clusterData[1] || [];
        } else if (clusterData.length === 1) {
          // If only one element, assume it's the improvement clusters
          improvementClusters = Array.isArray(clusterData[0]) ? clusterData[0] : [];
        }
      } else if (clusterData && typeof clusterData === 'object') {
        // If response is an object with properties
        suggestions = clusterData.suggestions || {};
        improvementClusters = clusterData.improvement_clusters || [];
      }
      
      // Validate that we have an array for improvement clusters
      if (!Array.isArray(improvementClusters)) {
        console.error("Could not extract improvement_clusters array from response:", clusterData);
        throw new Error("Invalid response from cluster API - could not find improvement_clusters array");
      }
      
      // Map backend data to frontend format
      const mappedAnnotations = annotationData.annotations.map(mapBackendDataToDataPoint);
      const mappedImprovementClusters = improvementClusters.map(item => mapBackendDataToDataPoint(item as DataPoint));
      
      // Validate suggestions object
      if (typeof suggestions !== 'object' || suggestions === null) {
        console.warn("Invalid suggestions structure, using empty object:", suggestions);
        suggestions = {};
      }
      
      // Combine the results
      const combinedData = {
        annotations: mappedAnnotations,
        suggestions: suggestions,
        improvement_clusters: mappedImprovementClusters,
        requestData: {
          examples,
          annotation_guideline,  // Use the string format
          uploadMethod
        }
      };
      
      // Store the combined data in IndexedDB
      await dataManager.saveData(combinedData);
      
      // Navigate to dashboard after the API calls complete
      navigate("/dashboard");
    } catch (error) {
      console.error("Error during API calls:", error);
      setApiError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to load demo data
  const handleLoadDemo = async () => {
    setIsLoading(true);

    try {
      // Clear existing data first to force reload from JSON files
      await dataManager.clearData();
      
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      
      // Load annotation, cluster, reannotation, and recluster response files
      const [annotationResponse, clusterResponse, reannotationResponse, reclusterResponse] = await Promise.all([
        fetch(`/annotation_response.json?t=${timestamp}`),
        fetch(`/cluster_response.json?t=${timestamp}`),
        fetch(`/reannotation_response.json?t=${timestamp}`),
        fetch(`/recluster_response.json?t=${timestamp}`)
      ]);

      if (!annotationResponse.ok || !clusterResponse.ok || !reannotationResponse.ok || !reclusterResponse.ok) {
        throw new Error(`Failed to load demo data: ${annotationResponse.status} ${annotationResponse.statusText}`);
      }
      
      const annotationData = await annotationResponse.json();
      const clusterData = await clusterResponse.json();
      const reannotationData = await reannotationResponse.json();
      const reclusterData = await reclusterResponse.json();
      
      // Add debug logging for current issue
      console.log("Demo annotationData.annotations (first 5):", annotationData.annotations.slice(0, 5));
      
      // Map backend data to frontend format (same as in handleSubmit)
      const mappedAnnotations = annotationData.annotations.map(mapBackendDataToDataPoint);
      const mappedImprovementClusters = clusterData.improvement_clusters.map((item: unknown) => mapBackendDataToDataPoint(item as DataPoint));
      const mappedReannotationData = reannotationData.annotations.map(mapBackendDataToDataPoint);
      
      // Handle recluster data structure using the new parseReclusterResponse function
      const parsedReclusterData = parseReclusterResponse(reclusterData);
      const mappedReclusterData = parsedReclusterData.improvement_clusters || [];
      const reclusterSuggestions = parsedReclusterData.suggestions || {};
      
      console.log("Demo mappedAnnotations (first 5):", mappedAnnotations.slice(0, 5));
      console.log("Demo reclusterSuggestions:", reclusterSuggestions);
      console.log("Demo mappedReclusterData (first 3):", mappedReclusterData.slice(0, 3));
      
      // Create a mock request data with guideline as string
      const demoGuidelineString = `${task}\n\nLabels:\n${labels.map(label => `- ${label}`).join('\n')}`;
      const requestData = {
        examples: annotationData.examples || [],
        annotation_guideline: demoGuidelineString,
        uploadMethod: "paste" as const
      };
      
      // Combine the data from both responses
      const combinedData = {
        annotations: mappedAnnotations,
        suggestions: clusterData.suggestions,
        improvement_clusters: mappedImprovementClusters,
        requestData,
        // Store demo reannotation data for iterate functionality
        demoReannotationData: mappedReannotationData,
        demoReclusterData: mappedReclusterData, // Use actual recluster data for demo
        demoReclusterSuggestions: reclusterSuggestions, // Store recluster suggestions
        isDemoMode: true
      };
      
      // Store data in IndexedDB
      await dataManager.saveData(combinedData);
      
      // Navigate to dashboard page
      navigate("/dashboard");
    } catch (error) {
      console.error("Error loading demo data:", error);
      setApiError("Failed to load demo data: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };
  
  const isSubmitDisabled = () => {
    return (
      !task || 
      labels.length === 0 || 
      (uploadMethod === "paste" && !textToAnnotate) || 
      (uploadMethod === "upload" && files.length === 0) ||
      parseError !== null ||
      isLoading
    );
  };

  // Calculate current step for progress indicator
  const getCurrentStep = () => {
    if (!task.trim()) return 0;
    if (labels.length === 0) return 1;
    if (uploadMethod === "paste" && !textToAnnotate.trim()) return 2;
    if (uploadMethod === "upload" && files.length === 0) return 2;
    return 3;
  };
  
  // Add a new label
  const handleAddLabel = () => {
    if (newLabel.trim()) {
      setLabels([...labels, newLabel.trim()]);
      setNewLabel("");
    }
  };

  // Remove a label
  const handleRemoveLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  // Function to load sample examples from sample.json
  const loadSampleExamples = () => {
    setIsLoading(true);
    fetch('/sample.json')
      .then(response => response.json())
      .then(data => {
        if (data.examples && Array.isArray(data.examples)) {
          setTextToAnnotate(data.examples.join('\n\n'));
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Error loading sample.json:", error);
        setApiError("Failed to load sample examples");
        setIsLoading(false);
      });
  };

  return (
    <div className={styles.homeContainer}>
      <TourGuide page="home" />
      
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <Spin 
            indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} 
            size="large"
          />
          <Text className={styles.loadingText}>Processing your data...</Text>
        </div>
      )}
      
      <Card className={styles.uploadCard}>
        <div className={styles.headerSection}>
          <Title level={3} className={styles.mainTitle}>LLM-assisted Annotation & Analysis Tool</Title>
        </div>
        
        <StepIndicator currentStep={getCurrentStep()} />
        
        <div className={styles.panelContainer}>
          <div className={styles.guidelinesPanel}>
            <div className={styles.sectionHeader}>
              <h2>Annotation Guidelines</h2>
            </div>
            
            <div className={styles.guidelinesContent}>
              <div className={styles.inputSection} data-tour="task-description">
                <div className={styles.sectionTitleWithTooltip}>
                  <Title level={5} className={styles.sectionTitle}>Task Description</Title>
                  <Tooltip title="Clearly describe your annotation task, e.g., 'Sentiment analysis of text' or 'Hate speech detection'">
                    <InfoCircleOutlined className={styles.infoIcon} />
                  </Tooltip>
                </div>
                <TextArea
                  className={styles.textareaInput}
                  placeholder="e.g., Please annotate if a social media post contains hate speech or not...."
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  disabled={isLoading}
                  autoSize={{ minRows: 3, maxRows: 6 }}
                />
              </div>
              
              <div className={styles.inputSection} data-tour="task-id-section">
                <div className={styles.sectionTitleWithTooltip}>
                  <Title level={5} className={styles.sectionTitle}>Task ID</Title>
                  <Tooltip title="Enter a unique task ID for your annotation task. This enables backend caching for faster processing. Use meaningful names like 'hate_speech_detection' or 'sentiment_analysis_tweets'.">
                    <InfoCircleOutlined className={styles.infoIcon} />
                  </Tooltip>
                </div>
                <Input
                  className={styles.taskIdInput}
                  placeholder="e.g., hate_speech_detection, sentiment_analysis_tweets, product_review_classification"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              
              <div className={styles.inputSection} data-tour="labels-section">
                <div className={styles.sectionTitleWithTooltip}>
                  <Title level={5} className={styles.sectionTitle}>Labels</Title>
                  <Tooltip title="Add the label categories you need, at least 2 labels required. e.g., 'Positive', 'Negative', 'Neutral'">
                    <InfoCircleOutlined className={styles.infoIcon} />
                  </Tooltip>
                </div>
                <div className={styles.criteriaList}>
                  {labels.map((label, index) => (
                    <div key={`label-${index}-${label.substring(0, 10)}`} className={styles.criterionItem}>
                      <span className={styles.criterionText}>{label}</span>
                      <button
                        className={styles.removeCriterionButton}
                        onClick={() => handleRemoveLabel(index)}
                        disabled={isLoading}
                        aria-label="Remove label"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className={styles.addCriterionContainer}>
                  <Input
                    placeholder="Add a new label..."
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onPressEnter={handleAddLabel}
                    disabled={isLoading}
                    className={styles.criterionInput}
                  />
                  <Button 
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddLabel}
                    disabled={isLoading}
                    className={styles.addButton}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          <div className={styles.contentPanel}>
            <div className={styles.sectionHeader}>
              <h2>Text to Annotate</h2>
              <Tooltip title="Upload CSV file or paste text directly. Each line or paragraph will be treated as a separate annotation sample.">
                <InfoCircleOutlined className={styles.headerInfoIcon} />
              </Tooltip>
            </div>
            
            <div className={styles.contentContainer} data-tour="text-input">
              <div className={styles.uploadMethodToggle}>
                <div className={styles.uploadModeSection}>
                  <Button.Group>
                    <Button
                      type={uploadMethod === "paste" ? "primary" : "default"}
                      onClick={() => setUploadMethod("paste")}
                      disabled={isLoading}
                      className={`${styles.toggleButton} ${uploadMethod === "paste" ? styles.activeToggle : ""}`}
                      icon={<span className={styles.toggleIcon}>✏️</span>}
                    >
                      Paste Text
                    </Button>
                    <Button
                      type={uploadMethod === "upload" ? "primary" : "default"}
                      onClick={() => setUploadMethod("upload")}
                      disabled={isLoading}
                      className={`${styles.toggleButton} ${uploadMethod === "upload" ? styles.activeToggle : ""}`}
                      icon={<span className={styles.toggleIcon}>📄</span>}
                    >
                      Upload File
                    </Button>
                  </Button.Group>
                </div>
              </div>
              
              <div className={styles.contentInputArea}>
                {uploadMethod === "paste" ? (
                  <>
                    <TextArea
                      className={styles.textareaInput}
                      placeholder="Paste your text here..."
                      value={textToAnnotate}
                      onChange={(e) => setTextToAnnotate(e.target.value)}
                      disabled={isLoading}
                      autoSize={{ minRows: 5, maxRows: 10 }}
                    />
                    <span
                      onClick={loadSampleExamples}
                      className={styles.loadSamplesButton}
                      style={{ cursor: isLoading ? 'not-allowed' : 'pointer' }}
                    >
                      Load Sample Examples
                    </span>
                  </>
                ) : (
                  <div
                    className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${files.length > 0 ? styles.hasFiles : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      handleFileChange(e.dataTransfer.files);
                    }}
                  >
                    <Upload
                      beforeUpload={() => false}
                      onChange={({ fileList }) => {
                        if (fileList.length > 0 && fileList[0].originFileObj) {
                          const dataTransfer = new DataTransfer();
                          dataTransfer.items.add(fileList[0].originFileObj);
                          handleFileChange(dataTransfer.files);
                        }
                      }}
                      disabled={isLoading}
                      showUploadList={false}
                    >
                      <p className={styles.uploadIcon}>
                        <UploadOutlined />
                      </p>
                      <p className={styles.dropZoneText}>
                        {files.length > 0 
                          ? `${files.length} file${files.length !== 1 ? 's' : ''} selected` 
                          : 'Drop text file or click to browse'}
                      </p>
                    </Upload>
                    
                    <div className={styles.fileFormatInfo}>
                      <p>Supported format: CSV</p>
                      <p><strong>Note:</strong> CSV files must contain a column named "text_to_annotate"</p>
                    </div>
                  </div>
                )}
                
                {parseError && (
                  <div className={styles.errorMessage}>
                    {parseError}
                  </div>
                )}
                
                {apiError && (
                  <div className={styles.errorMessage}>
                    API Error: {apiError}
                  </div>
                )}
                
                {uploadMethod === "upload" && files.length > 0 && (
                  <div className={styles.fileList}>
                    <Title level={5} className={styles.fileListTitle}>Selected Files:</Title>
                    <ul>
                      {files.map((file, index) => (
                        <li key={index} className={styles.fileItem}>
                          <Text className={styles.fileName}>{file.name}</Text>
                          <Text type="secondary" className={styles.fileSize}>
                            {(file.size / 1024).toFixed(2)} KB
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className={styles.actionSection} data-tour="submit-button">
          <Button 
            type="primary"
            size="large"
            onClick={handleSubmit}
            disabled={isSubmitDisabled()}
            className={styles.submitButton}
            loading={isLoading}
          >
            {isLoading ? 'Processing...' : 'Send'}
          </Button>
          <Button 
            type="primary"
            onClick={handleLoadDemo}
            disabled={isLoading}
            className={styles.demoButton}
          >
            Load Demo Data
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Home; 