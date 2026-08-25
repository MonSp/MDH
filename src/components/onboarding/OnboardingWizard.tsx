import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../../services/apiFetch';

interface OnboardingState {
  completed: boolean;
  current_step: number;
  api_key_configured: boolean;
  model_selected: string;
  tasks_completed: number;
  started_at: string;
  completed_at: string;
}

interface OnboardingTask {
  index: number;
  title: string;
  description: string;
  difficulty: string;
  expected_path: string;
  xp_reward: number;
  skill_hint: string;
}

interface OnboardingWizardProps {
  onComplete: () => void;
  /** Simulate sending a user message to the backend; resolves true on success */
  onExecuteTask?: (description: string) => Promise<boolean>;
}

const TOTAL_STEPS = 7; // steps 0-6

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  modal: {
    width: '90vw',
    maxWidth: 720,
    maxHeight: '90vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    borderRadius: 20,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '0 0 60px rgba(139, 92, 246, 0.15), 0 25px 50px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  dotsContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '20px 0 8px',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    transition: 'all 0.3s ease',
    cursor: 'default',
  },
  dotActive: {
    background: '#a78bfa',
    boxShadow: '0 0 8px rgba(167, 139, 250, 0.6)',
    transform: 'scale(1.2)',
  },
  dotCompleted: {
    background: '#7c3aed',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px 24px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  btn: {
    padding: '10px 28px',
    borderRadius: 10,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    color: '#fff',
    boxShadow: '0 4px 15px rgba(124, 58, 237, 0.4)',
  },
  btnSecondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: '#94a3b8',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  /* Step 0: Welcome */
  welcomeTitle: {
    fontSize: 36,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #a78bfa, #c084fc, #e879f9)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 36,
    textAlign: 'center',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    width: '100%',
    maxWidth: 600,
  },
  featureCard: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: '20px 16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    textAlign: 'center',
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: '1.5',
  },
  /* Step 1: API Key */
  inputGroup: {
    width: '100%',
    maxWidth: 480,
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#cbd5e1',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 6,
  },
  /* Step 2: Model Selection */
  radioGroup: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  radioOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  radioOptionSelected: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    background: 'rgba(139, 92, 246, 0.1)',
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: '2px solid #475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDotSelected: {
    borderColor: '#a78bfa',
  },
  radioDotInner: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#a78bfa',
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e2e8f0',
  },
  radioDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  radioContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  /* Steps 3-5: Tasks */
  taskCard: {
    width: '100%',
    maxWidth: 520,
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 28,
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 8,
  },
  taskDesc: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.6,
    marginBottom: 16,
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 16,
  },
  badgeEasy: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },
  badgeMedium: {
    background: 'rgba(234, 179, 8, 0.15)',
    color: '#facc15',
    border: '1px solid rgba(234, 179, 8, 0.3)',
  },
  badgeHard: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  xpReward: {
    fontSize: 13,
    color: '#a78bfa',
    fontWeight: 600,
    marginBottom: 16,
  },
  resultBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    fontSize: 13,
    color: '#86efac',
  },
  errorBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    fontSize: 13,
    color: '#fca5a5',
  },
  spinner: {
    width: 20,
    height: 20,
    border: '2px solid rgba(139, 92, 246, 0.2)',
    borderTopColor: '#a78bfa',
    borderRadius: '50%',
    display: 'inline-block',
    marginRight: 8,
    animation: 'spin 0.8s linear infinite',
  },
  /* Step 6: Completion */
  completionTitle: {
    fontSize: 28,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #34d399, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 16,
    textAlign: 'center',
  },
  summaryCard: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: '20px 28px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    minWidth: 260,
    marginBottom: 24,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: 14,
    color: '#cbd5e1',
  },
  summaryValue: {
    fontWeight: 700,
    color: '#a78bfa',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 6,
    textAlign: 'center',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
};

const DIFFICULTY_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  easy: { label: '简单', style: styles.badgeEasy },
  medium: { label: '中等', style: styles.badgeMedium },
  hard: { label: '困难', style: styles.badgeHard },
};

const MODEL_OPTIONS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat', desc: '推荐 - 通用对话模型，性价比最高', recommended: true },
  { value: 'deepseek-coder', label: 'DeepSeek Coder', desc: '代码专精，适合开发任务' },
  { value: 'gpt-4', label: 'OpenAI GPT-4', desc: 'OpenAI 旗舰模型' },
  { value: 'custom', label: '自定义模型', desc: '配置自定义 OpenAI 兼容端点' },
];

const FEATURE_CARDS = [
  { icon: '\u{1F916}', title: '智能任务执行', desc: 'AI 理解你的意图，自动拆解并执行复杂任务' },
  { icon: '\u{1F527}', title: '技能随用随进化', desc: '每次使用都在学习，技能持续迭代升级' },
  { icon: '\u{1F465}', title: '团队协作', desc: '多智能体协作，像真正的团队一样配合' },
];

/** Inject keyframes for spinner */
const SpinnerStyle = () => (
  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
);

export default function OnboardingWizard({ onComplete, onExecuteTask }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [taskResults, setTaskResults] = useState<Record<number, 'pending' | 'running' | 'done' | 'error'>>({});
  const [taskOutputs, setTaskOutputs] = useState<Record<number, string>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [totalXp, setTotalXp] = useState(0);

  // Fetch initial onboarding state
  useEffect(() => {
    apiGet<OnboardingState>('/onboarding/state')
      .then(state => {
        if (state.completed) {
          onComplete();
          return;
        }
        setStep(state.current_step || 0);
      })
      .catch(() => { /* start from step 0 */ })
      .finally(() => setLoading(false));
  }, [onComplete]);

  // Fetch tasks when entering step 3
  useEffect(() => {
    if (step === 3 && tasks.length === 0) {
      setTasksLoading(true);
      apiGet<OnboardingTask[]>('/onboarding/tasks')
        .then(t => {
          setTasks(t);
          const init: Record<number, 'pending'> = {};
          t.forEach(task => { init[task.index] = 'pending'; });
          setTaskResults(init);
        })
        .catch(() => { /* tasks unavailable */ })
        .finally(() => setTasksLoading(false));
    }
  }, [step, tasks.length]);

  const recordStep = useCallback(async (s: number) => {
    try { await apiPost('/onboarding/step', { step: s }); } catch { /* non-blocking */ }
  }, []);

  const goNext = useCallback(() => {
    const next = Math.min(step + 1, TOTAL_STEPS - 1);
    setStep(next);
    recordStep(next);
  }, [step, recordStep]);

  const goPrev = useCallback(() => {
    setStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleValidateApiKey = useCallback(() => {
    if (!apiKey.trim()) {
      setApiKeyError('请输入 API Key');
      return;
    }
    if (!apiKey.trim().startsWith('sk-')) {
      setApiKeyError('API Key 格式不正确，需以 sk- 开头');
      return;
    }
    setApiKeyError('');
    // Persist the key to localStorage for the rest of the app
    localStorage.setItem('deepseek_api_key', apiKey.trim());
    goNext();
  }, [apiKey, goNext]);

  const handleConfirmModel = useCallback(() => {
    localStorage.setItem('llm_provider', selectedModel.startsWith('gpt') ? 'openai' : 'deepseek');
    localStorage.setItem('llm_model_name', selectedModel);
    goNext();
  }, [selectedModel, goNext]);

  const handleExecuteTask = useCallback(async (task: OnboardingTask) => {
    setTaskResults(prev => ({ ...prev, [task.index]: 'running' }));
    try {
      if (onExecuteTask) {
        const ok = await onExecuteTask(task.description);
        setTaskResults(prev => ({ ...prev, [task.index]: ok ? 'done' : 'error' }));
        setTaskOutputs(prev => ({ ...prev, [task.index]: ok ? '任务执行完成！' : '执行未成功' }));
        if (ok) setTotalXp(xp => xp + task.xp_reward);
      } else {
        // Fallback: simulate with a short delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        setTaskResults(prev => ({ ...prev, [task.index]: 'done' }));
        setTaskOutputs(prev => ({ ...prev, [task.index]: '任务执行完成！' }));
        setTotalXp(xp => xp + task.xp_reward);
      }
    } catch {
      setTaskResults(prev => ({ ...prev, [task.index]: 'error' }));
      setTaskOutputs(prev => ({ ...prev, [task.index]: '执行失败，请稍后重试' }));
    }
  }, [onExecuteTask]);

  const handleFinishTask = useCallback(async () => {
    const currentTask = tasks[step - 3];
    if (currentTask) {
      // Mark this task as done in state tracking
    }
    if (step - 3 < tasks.length - 1) {
      goNext();
    } else {
      // Last task done, complete onboarding
      try { await apiPost('/onboarding/complete'); } catch { /* best-effort */ }
      goNext();
    }
  }, [step, tasks, goNext]);

  // ---- Render helpers ----

  const renderDots = () => (
    <div style={styles.dotsContainer}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          style={{
            ...styles.dot,
            ...(i === step ? styles.dotActive : i < step ? styles.dotCompleted : {}),
          }}
        />
      ))}
    </div>
  );

  const renderStep0 = () => (
    <>
      <div style={styles.welcomeTitle}>{'欢迎来到大荒界'}</div>
      <div style={styles.welcomeSubtitle}>{'数字员工操作系统 — 让 AI 像真正的员工一样学习和成长'}</div>
      <div style={styles.featureGrid}>
        {FEATURE_CARDS.map(card => (
          <div key={card.title} style={styles.featureCard}>
            <div style={styles.featureIcon}>{card.icon}</div>
            <div style={styles.featureTitle}>{card.title}</div>
            <div style={styles.featureDesc}>{card.desc}</div>
          </div>
        ))}
      </div>
    </>
  );

  const renderStep1 = () => (
    <>
      <div style={styles.pageTitle}>配置 API Key</div>
      <div style={styles.pageSubtitle}>输入你的 DeepSeek API Key 以启用 AI 能力</div>
      <div style={styles.inputGroup}>
        <label style={styles.label}>DeepSeek API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setApiKeyError(''); }}
          placeholder="sk-..."
          style={{ ...styles.input, ...(apiKeyError ? styles.inputError : {}) }}
          onKeyDown={e => { if (e.key === 'Enter') handleValidateApiKey(); }}
        />
        {apiKeyError && <div style={styles.errorText}>{apiKeyError}</div>}
      </div>
    </>
  );

  const renderStep2 = () => (
    <>
      <div style={styles.pageTitle}>选择模型</div>
      <div style={styles.pageSubtitle}>为你的数字员工选择默认 LLM 模型</div>
      <div style={styles.radioGroup}>
        {MODEL_OPTIONS.map(opt => (
          <div
            key={opt.value}
            style={{
              ...styles.radioOption,
              ...(selectedModel === opt.value ? styles.radioOptionSelected : {}),
            }}
            onClick={() => setSelectedModel(opt.value)}
          >
            <div style={{
              ...styles.radioDot,
              ...(selectedModel === opt.value ? styles.radioDotSelected : {}),
            }}>
              {selectedModel === opt.value && <div style={styles.radioDotInner} />}
            </div>
            <div style={styles.radioContent}>
              <div style={styles.radioLabel}>
                {opt.label}
                {opt.recommended && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'rgba(139, 92, 246, 0.2)',
                    color: '#a78bfa',
                  }}>推荐</span>
                )}
              </div>
              <div style={styles.radioDesc}>{opt.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderTaskStep = () => {
    const taskIndex = step - 3;
    const task = tasks[taskIndex];
    if (tasksLoading) {
      return <div style={{ color: '#94a3b8', fontSize: 14 }}>加载任务中...</div>;
    }
    if (!task) {
      return <div style={{ color: '#94a3b8', fontSize: 14 }}>未找到任务</div>;
    }
    const result = taskResults[task.index] || 'pending';
    const output = taskOutputs[task.index] || '';
    const difficulty = DIFFICULTY_BADGE[task.difficulty] || DIFFICULTY_BADGE.medium;

    return (
      <div style={styles.taskCard}>
        <div style={styles.taskTitle}>{`任务 ${taskIndex + 1}: ${task.title}`}</div>
        <div style={{ ...styles.badge, ...difficulty.style }}>{difficulty.label}</div>
        <div style={styles.taskDesc}>{task.description}</div>
        <div style={styles.xpReward}>{`+${task.xp_reward} XP`}</div>
        {result === 'pending' && (
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => handleExecuteTask(task)}
          >
            {'执行任务'}
          </button>
        )}
        {result === 'running' && (
          <div style={{ display: 'flex', alignItems: 'center', color: '#a78bfa', fontSize: 14 }}>
            <div style={styles.spinner} />
            {'执行中...'}
          </div>
        )}
        {result === 'done' && (
          <div style={styles.resultBox}>{'\u2705 '}{output}</div>
        )}
        {result === 'error' && (
          <>
            <div style={styles.errorBox}>{'\u274C '}{output}</div>
            <button
              style={{ ...styles.btn, ...styles.btnSecondary, marginTop: 12 }}
              onClick={() => handleExecuteTask(task)}
            >
              {'重试'}
            </button>
          </>
        )}
      </div>
    );
  };

  const renderStep6 = () => (
    <>
      <div style={styles.completionTitle}>{'恭喜！你的数字员工已准备就绪'}</div>
      <div style={styles.summaryCard}>
        <div style={styles.summaryRow}>
          <span>完成任务数</span>
          <span style={styles.summaryValue}>{tasks.length}</span>
        </div>
        <div style={styles.summaryRow}>
          <span>获得 XP</span>
          <span style={styles.summaryValue}>{totalXp}</span>
        </div>
        <div style={styles.summaryRow}>
          <span>默认模型</span>
          <span style={styles.summaryValue}>{selectedModel}</span>
        </div>
      </div>
    </>
  );

  // ---- Navigation logic ----

  const currentTask = step >= 3 && step <= 5 ? tasks[step - 3] : null;
  const currentTaskResult = currentTask ? taskResults[currentTask.index] : undefined;
  const isTaskStep = step >= 3 && step <= 5;
  const canGoNext = isTaskStep ? currentTaskResult === 'done' : true;
  const isLastTaskStep = step === 3 + tasks.length - 1 && tasks.length > 0;

  if (loading) return null;

  return (
    <div style={styles.overlay}>
      <SpinnerStyle />
      <div style={styles.modal}>
        {renderDots()}

        <div style={styles.content}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {isTaskStep && renderTaskStep()}
          {step === 6 && renderStep6()}
        </div>

        <div style={styles.nav}>
          {step > 0 && step < 6 ? (
            <button
              style={{ ...styles.btn, ...styles.btnSecondary }}
              onClick={goPrev}
            >
              {'上一步'}
            </button>
          ) : (
            <div />
          )}

          {step === 0 && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={goNext}
            >
              {'开始配置'}
            </button>
          )}

          {step === 1 && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={handleValidateApiKey}
            >
              {'验证并继续'}
            </button>
          )}

          {step === 2 && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={handleConfirmModel}
            >
              {'确认选择'}
            </button>
          )}

          {isTaskStep && currentTaskResult === 'done' && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={handleFinishTask}
            >
              {isLastTaskStep ? '完成' : '继续'}
            </button>
          )}

          {step === 6 && (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={onComplete}
            >
              {'进入大荒界'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
