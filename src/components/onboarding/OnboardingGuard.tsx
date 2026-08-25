import React, { useState, useEffect } from 'react';
import { apiGet } from '../../services/apiFetch';
import OnboardingWizard from './OnboardingWizard';

interface Props {
  children: React.ReactNode;
  /** Optional callback to simulate sending a user message for task execution */
  onExecuteTask?: (description: string) => Promise<boolean>;
}

export default function OnboardingGuard({ children, onExecuteTask }: Props) {
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ completed: boolean }>('/onboarding/state')
      .then(state => setShowWizard(!state.completed))
      .catch(() => setShowWizard(false)) // Don't block on error
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <>
      {children}
      {showWizard && (
        <OnboardingWizard
          onComplete={() => setShowWizard(false)}
          onExecuteTask={onExecuteTask}
        />
      )}
    </>
  );
}
