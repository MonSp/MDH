import React from 'react';

export interface ToolStep {
  callId: string;
  name: string;
  args: any;
  status: 'active' | 'done' | 'error' | 'retrying';
  detail: string;
  duration: string;
  resultText: string;
  startTime: number;
}

interface ToolTreeProps {
  steps: ToolStep[];
}

export default function ToolTree({ steps }: ToolTreeProps) {
  if (steps.length === 0) return null;

  return (
    <div className="tool-tree">
      {steps.map((step, i) => (
        <div key={i} className="tool-tree-item">
          <div className="tool-tree-dot" data-status={step.status}>
            {step.status === 'done' ? '✓' : step.status === 'error' ? '✕' : step.status === 'retrying' ? '↻' : '●'}
          </div>
          <div className="tool-tree-content">
            <div className="tool-tree-header">
              <span className="tool-tree-name">{step.name}</span>
              {step.duration && <span className="tool-tree-duration">{step.duration}</span>}
            </div>
            {step.detail && step.status !== 'done' && step.status !== 'error' && (
              <div className="tool-tree-detail">{step.detail}</div>
            )}
            {step.status === 'done' && step.resultText && (
              <pre className="tool-tree-result">{step.resultText}</pre>
            )}
            {step.status === 'error' && step.detail && (
              <div className="tool-tree-error">{step.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
