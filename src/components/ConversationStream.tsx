import React from 'react';
import { Bubble, Markdown } from '@agentscope-ai/chat';
import ToolTree, { type ToolStep } from './ToolTree';

export interface Conversation {
  id: string;
  userMessage: string;
  status: 'running' | 'done' | 'error';
  thinking: string;
  replyText: string;
  toolSteps: ToolStep[];
  errorMessage: string;
  thinkCollapsed: boolean;
}

interface ConversationStreamProps {
  conversations: Conversation[];
  onOpenSkillEditor: (conv: Conversation) => void;
  onToggleThinkCollapse: (convId: string) => void;
}

export default function ConversationStream({
  conversations,
  onOpenSkillEditor,
  onToggleThinkCollapse,
}: ConversationStreamProps) {
  if (conversations.length === 0) {
    return (
      <div className="conv-empty">
        <p className="empty-title">AI Agent 就绪</p>
        <p className="empty-desc">输入自然语言指令，AI 将自动编排并执行浏览器操作</p>
      </div>
    );
  }

  return (
    <>
      {conversations.map(conv => (
        <ConversationBlock
          key={conv.id}
          conv={conv}
          onOpenSkillEditor={onOpenSkillEditor}
          onToggleThinkCollapse={onToggleThinkCollapse}
        />
      ))}
    </>
  );
}

interface ConversationBlockProps {
  conv: Conversation;
  onOpenSkillEditor: (conv: Conversation) => void;
  onToggleThinkCollapse: (convId: string) => void;
}

function ConversationBlock({ conv, onOpenSkillEditor, onToggleThinkCollapse }: ConversationBlockProps) {
  const bubbleItems = [
    {
      key: conv.id + '-user',
      content: conv.userMessage,
      placement: 'end' as const,
    },
    {
      key: conv.id + '-agent',
      content: (
        <div>
          {conv.thinking && (
            <details className="think-section" open={!conv.thinkCollapsed}>
              <summary className="think-header" onClick={() => onToggleThinkCollapse(conv.id)}>
                推理过程
              </summary>
              <div className="think-text">{conv.thinking}</div>
            </details>
          )}

          <ToolTree steps={conv.toolSteps} />

          {conv.replyText && (
            <div className="agent-reply">
              <Markdown>{conv.replyText}</Markdown>
              {conv.status === 'running' && <span className="streaming-cursor">|</span>}
            </div>
          )}

          {conv.status === 'done' && !conv.replyText && conv.toolSteps.length > 0 && (
            <div className="agent-result">任务完成</div>
          )}

          {conv.status === 'done' && conv.toolSteps.filter(s => s.status === 'done').length > 0 && (
            <div className="result-actions">
              <span className="result-stats">
                <strong>{conv.toolSteps.filter(s => s.status === 'done').length}</strong> 步骤
              </span>
              <button className="save-skill-btn" onClick={() => onOpenSkillEditor(conv)}>
                保存为 Skill
              </button>
            </div>
          )}

          {conv.status === 'running' && !conv.replyText && !conv.thinking && conv.toolSteps.length === 0 && (
            <div className="agent-loading">
              <span className="loading-dot-pulse"></span>
              <span>执行中...</span>
            </div>
          )}

          {conv.status === 'error' && (
            <div className="agent-error">
              <span>⚠</span> {conv.errorMessage || '执行遇到错误，请重试'}
            </div>
          )}
        </div>
      ),
      placement: 'start' as const,
      loading: conv.status === 'running',
      msgStatus: conv.status === 'running' ? 'generating' as const : 'finished' as const,
    },
  ];

  return <Bubble.List items={bubbleItems} />;
}
