import { ToolCall, ToolResult } from '../team/types.js';

export interface IToolkitRouter {
  execute(toolCall: ToolCall, workspace: string): Promise<ToolResult>;
}
