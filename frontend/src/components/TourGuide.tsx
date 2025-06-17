import React, { useState, useEffect } from 'react';
import Joyride, { Step, CallBackProps, STATUS, EVENTS, ACTIONS } from 'react-joyride';

interface TourGuideProps {
  page: 'home' | 'dashboard';
  onFinish?: () => void;
}

const TourGuide: React.FC<TourGuideProps> = ({ page, onFinish }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Home page tour steps
  const homeSteps: Step[] = [
    {
      target: 'body',
      content: (
        <div>
          <h2>Welcome to the LLM-Assisted Annotation & Analysis Tool!</h2>
          <p>Let's start with a quick tour!</p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="task-description"]',
      content: (
        <div>
          <h3>Set Up Annotation Task</h3>
          <p>First, clearly describe your annotation task. Specify the type of classification or labeling work you want to complete.</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="labels-section"]',
      content: (
        <div>
          <h3>Define Labels</h3>
          <p>Add the label categories you need. These labels will be used to classify text data. At least 2 labels are required.</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="text-input"]',
      content: (
        <div>
          <h3>Prepare Text Data</h3>
          <p>Choose your input method: paste text directly or upload a CSV file. CSV files must contain a "text_to_annotate" column.</p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="submit-button"]',
      content: (
        <div>
          <h3>Start Analysis</h3>
          <p>Click the "Send" button to automatically perform annotation and cluster analysis. You can also load demo data to try it out.</p>
        </div>
      ),
      placement: 'top',
    },
  ];

  // Dashboard page tour steps
  const dashboardSteps: Step[] = [
    {
      target: 'body',
      content: (
        <div>
          <h2>Welcome to the Analysis Dashboard!</h2>
          <p>Here you can view annotation results and intelligent analysis. Let me introduce the various functional modules!</p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="annotation-guidelines"]',
      content: (
        <div>
          <h3>Current Annotation Guidelines</h3>
          <p>The "Current Guidelines" section allows you to optimize your annotation task description and manage labels. You can modify the task description and add or remove labels as needed.</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="upper-scatter-plot"]',
      content: (
        <div>
          <h3>View Annotation Results</h3>
          <p>The <strong>upper scatter plot</strong> shows all your annotated text samples. Each point represents an example, clustered by similarity. Different colors represent different annotation labels or clusters. This plot corresponds to the <strong>"All Examples"</strong> section on the right.</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="all-examples"]',
      content: (
        <div>
          <h3>All Examples - Interactive with Upper Plot</h3>
          <p>This section corresponds to the <strong>upper scatter plot</strong> you just saw. <strong>Click any point</strong> in the upper plot or <strong>click any example</strong> in this list - they will highlight each other! You can see detailed information including comparisons with the last iteration.</p>
        </div>
      ),
      placement: 'left',
    },
    {
      target: '[data-tour="lower-scatter-plot"]',
      content: (
        <div>
          <h3>Analyze Edge Cases</h3>
          <p>The <strong>lower scatter plot</strong> shows potential edge cases that may require attention. These are samples identified by the system as challenging or needing more precise guidelines. This plot corresponds to the <strong>"Suggested Edge Cases"</strong> section on the right.</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="suggested-edge-cases"]',
      content: (
        <div>
          <h3>Suggested Edge Cases - Interactive with Lower Plot</h3>
          <p>This section corresponds to the <strong>lower scatter plot</strong> you just saw. <strong>Click any point</strong> in the lower plot or <strong>click any suggestion</strong> here - they will highlight each other! When you click a point in the lower plot, the corresponding point in the upper plot will also be marked. <strong>Click the + button</strong> next to any suggestion to save it.</p>
        </div>
      ),
      placement: 'left',
    },
    {
      target: '[data-tour="edge-case-handling"]',
      content: (
        <div>
          <h3>Edge Case Handling</h3>
          <p>This section shows all the edge case handling rules you've saved from the suggestions. These saved rules will be automatically included when you iterate to improve annotation consistency and accuracy.</p>
        </div>
      ),
      placement: 'right',
    },
    {
      target: '[data-tour="iterate-button"]',
      content: (
        <div>
          <h3>Iterative Optimization</h3>
          <p>Click the "Iterate" button to re-annotate your data using the updated guidelines and saved edge case rules. This helps continuously improve annotation quality through multiple iterations.</p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="previous-guidelines"]',
      content: (
        <div>
          <h3>Previous Guidelines History</h3>
          <p>After you use the "Iterate" button, the "Previous Guideline" section will show all historical versions of your annotation guidelines from previous iterations. You can expand this section to review what guidelines were sent to the API in each version, helping you track the evolution of your annotation rules.</p>
        </div>
      ),
      placement: 'right',
    },
  ];

  const steps = page === 'home' ? homeSteps : dashboardSteps;

  useEffect(() => {
    const hasSeenTour = localStorage.getItem(`tour-${page}-completed`);
    if (!hasSeenTour) {
      // Start tour after a short delay
      const timer = setTimeout(() => {
        setIsRunning(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [page]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type, index, action } = data;

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Update state to advance the tour - fix the previous button logic
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    } else if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setIsRunning(false);
      setStepIndex(0);
      localStorage.setItem(`tour-${page}-completed`, 'true');
      onFinish?.();
    }
  };

  const restartTour = () => {
    setStepIndex(0);
    setIsRunning(true);
  };

  const joyrideStyles = {
    options: {
      primaryColor: '#4e7ad1',
      backgroundColor: '#ffffff',
      textColor: '#333333',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: 1000,
    },
    tooltip: {
      fontSize: '14px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    tooltipContent: {
      padding: '20px',
    },
    buttonNext: {
      backgroundColor: '#4e7ad1',
      borderRadius: '6px',
      border: 'none',
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: '500',
    },
    buttonBack: {
      color: '#666666',
      marginRight: '10px',
      border: '1px solid #d9d9d9',
      borderRadius: '6px',
      padding: '8px 16px',
      fontSize: '14px',
    },
    buttonSkip: {
      color: '#666666',
      fontSize: '14px',
    },
  };

  return (
    <>
      <Joyride
        callback={handleJoyrideCallback}
        continuous={true}
        hideCloseButton={false}
        run={isRunning}
        scrollToFirstStep={true}
        showProgress={true}
        showSkipButton={true}
        steps={steps}
        stepIndex={stepIndex}
        styles={joyrideStyles}
        locale={{
          back: 'Back',
          close: 'Close',
          last: 'Finish',
          next: 'Next',
          skip: 'Skip',
        }}
      />
      
      {/* Help button to restart tour */}
      {!isRunning && (
        <button
          onClick={restartTour}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: '#4e7ad1',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            fontSize: '18px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Restart Tour"
        >
          ?
        </button>
      )}
    </>
  );
};

export default TourGuide; 