import React from 'react';
import { Steps } from 'antd';
import { CheckCircleOutlined, EditOutlined, FileTextOutlined, SendOutlined } from '@ant-design/icons';
import styles from '../styles/StepIndicator.module.css';

const { Step } = Steps;

interface StepIndicatorProps {
  currentStep: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const steps = [
    {
      title: 'Task Description',
      icon: <EditOutlined />,
      description: 'Set annotation task'
    },
    {
      title: 'Define Labels',
      icon: <CheckCircleOutlined />,
      description: 'Add classification labels'
    },
    {
      title: 'Prepare Text',
      icon: <FileTextOutlined />,
      description: 'Input text to annotate'
    },
    {
      title: 'Start Analysis',
      icon: <SendOutlined />,
      description: 'Submit and analyze'
    }
  ];

  return (
    <div className={styles.stepIndicatorContainer}>
      <Steps 
        current={currentStep} 
        size="small"
        className={styles.steps}
      >
        {steps.map((step, index) => (
          <Step
            key={index}
            title={step.title}
            description={step.description}
            icon={step.icon}
          />
        ))}
      </Steps>
    </div>
  );
};

export default StepIndicator; 