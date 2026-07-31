import type { LLMConfig, Message, ToolCall, ToolDefinition } from '../llm/types.js';
import { chatStream } from '../llm/openai.js';
import type { IToolkitRouter } from '../toolkit/router.js';

export type EventHandler = (event: Record<string, unknown>) => void;

export interface AgentConfig {
  id: string;
  roleId: string;
  roleName: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  router: IToolkitRouter;
  workspace: string;
  llm: LLMConfig;
}

export interface ToolResult {
  call_id: string;
  tool_name: string;
  result: unknown;
  error?: string;
}

/**
 * RoleAgent — 每个团队角色的独立智能体实例。
 *
 * 拥有自己的消息上下文（messages[]）、system prompt 和工具集，
 * 可通过 chat()/chatWithTools() 与 LLM 交互，并跨 agent 传递上下文。
 */
export class RoleAgent {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;

  private config: AgentConfig;
  private messages: Message[];
  private maxContextChars = 600_000;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.roleId = config.roleId;
    this.roleName = config.roleName;
    this.config = config;
    this.messages = [{ role: 'system', content: config.systemPrompt }];
  }

  /** 纯文本调用（讨论阶段） */
  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    const response = await this.callLLMOnce(this.messages);
    this.messages.push({ role: 'assistant', content: response });
    return response;
  }

  /** 带工具的调用（执行阶段），返回最终文本 */
  async chatWithTools(
    userMessage: string,
    onEvent?: EventHandler,
    maxIterations = 15,
  ): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    let result = '';

    for (let i = 0; i < maxIterations; i++) {
      this.truncateIfNeeded();
      const response = await this.callLLMWithTools(this.messages);

      if (response.content) {
        onEvent?.({
          type: 'agent_message',
          agentId: this.id,
          content: response.content,
          timestamp: Date.now(),
        });
      }

      if (response.tool_calls.length === 0) {
        result = response.content || '';
        break;
      }

      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      for (const tc of response.tool_calls) {
        onEvent?.({
          type: 'tool_call',
          id: tc.id,
          tool: tc.function.name,
          args: tc.function.arguments,
        });

        const toolResult = await this.executeTool(tc);
        const resultStr = toolResult.error
          ? `Error: ${toolResult.error}`
          : String(toolResult.result ?? '');

        this.messages.push({
          role: 'tool',
          content: resultStr,
          tool_call_id: tc.id,
        });

        onEvent?.({
          type: 'tool_result',
          id: tc.id,
          tool: tc.function.name,
          result: resultStr,
          success: !toolResult.error,
          output: resultStr,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return result;
  }

  /** 获取上下文摘要（用于跨 agent 传递） */
  getContextSummary(maxChars = 2000): string {
    return this.messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n---\n')
      .substring(0, maxChars);
  }

  /** 注入外部上下文（如其他 agent 的讨论结果） */
  injectContext(context: string): void {
    this.messages.push({
      role: 'user',
      content: `[团队上下文]\n${context}`,
    });
  }

  /** 消息数量（调试用） */
  get messageCount(): number {
    return this.messages.length;
  }

  /** system prompt 内容 */
  get systemPrompt(): string {
    return this.config.systemPrompt;
  }

  private async executeTool(tc: ToolCall): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      return { call_id: tc.id, tool_name: tc.function.name, result: null, error: 'Invalid JSON' };
    }

    // 规范化路径参数：移除 workspace/ 前缀，防止双重嵌套
    for (const key of ['path', 'directory']) {
      if (typeof args[key] === 'string') {
        args[key] = (args[key] as string)
          .replace(/^\/?workspace\//, '')
          .replace(/^\.\//, '');
      }
    }

    return this.config.router.execute(
      { ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } },
      this.config.workspace,
    );
  }

  private async callLLMOnce(messages: Message[]): Promise<string> {
    let content = '';
    for await (const chunk of chatStream(this.config.llm, messages)) {
      content += chunk.delta;
    }
    return content;
  }

  private async callLLMWithTools(
    messages: Message[],
  ): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
    const contentParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for await (const chunk of chatStream(this.config.llm, messages, this.config.tools)) {
      if (chunk.delta) contentParts.push(chunk.delta);
      for (const tc of chunk.tool_calls) {
        if (tc.id) {
          toolCalls.push({
            id: tc.id,
            type: 'function',
            function: { name: tc.function!.name, arguments: tc.function!.arguments || '' },
          });
        } else if (toolCalls.length > 0) {
          toolCalls[toolCalls.length - 1].function.arguments += tc.function?.arguments || '';
        }
      }
    }

    return { content: contentParts.join('') || null, tool_calls: toolCalls };
  }

  private truncateIfNeeded(): void {
    let total = this.messages.reduce((s, m) => s + (m.content?.length || 0), 0);
    if (total <= this.maxContextChars) return;

    // 第一轮：截断过长的 tool 结果
    for (let i = 1; i < this.messages.length - 2 && total > this.maxContextChars; i++) {
      const msg = this.messages[i];
      if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
        const truncated = msg.content.substring(0, 200)
          + '\n... [截断] ...\n' + msg.content.slice(-100);
        total -= (msg.content.length - truncated.length);
        this.messages[i] = { ...msg, content: truncated };
      }
    }

    // 第二轮：截断过长的 assistant 消息
    for (let i = 1; i < this.messages.length - 2 && total > this.maxContextChars; i++) {
      const msg = this.messages[i];
      if (msg.role === 'assistant' && msg.content && msg.content.length > 1000) {
        const truncated = msg.content.substring(0, 1000) + '\n... [截断]';
        total -= (msg.content.length - truncated.length);
        this.messages[i] = { ...msg, content: truncated };
      }
    }

    // 第三轮：删除最早消息（保留 system 和最近 6 条）
    while (this.messages.length > 7 && total > this.maxContextChars) {
      const removed = this.messages.splice(1, 1)[0];
      total -= (removed.content?.length || 0);
    }
  }
}
