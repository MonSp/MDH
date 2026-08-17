/**
 * MCPToolkitRouter — 将 MCP 服务器工具暴露为 IToolkitRouter
 *
 * 管理多个 MCP 服务器连接，按工具名路由调用。
 *
 * 用法：
 *   const router = new MCPToolkitRouter();
 *   await router.addServer({ name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs', '/tmp'] });
 *   const result = await router.execute({ id: '1', type: 'function', function: { name: 'fs__read_file', arguments: '{"path":"/tmp/test.txt"}' } }, '/tmp');
 */

import type { ToolCall, ToolResult } from '../team/types.js';
import type { IToolkitRouter } from './router.js';
import { MCPClient, type MCPClientConfig, type MCPTool } from '../mcp/client.js';

interface ServerEntry {
  client: MCPClient;
  tools: Map<string, MCPTool>;  // toolName -> MCPTool
}

/**
 * MCPToolkitRouter — 实现 IToolkitRouter，路由工具调用到 MCP 服务器
 *
 * 工具命名约定：<serverName>__<toolName>
 * 例如：filesystem__read_file, git__git_status
 */
export class MCPToolkitRouter implements IToolkitRouter {
  private servers = new Map<string, ServerEntry>();

  /**
   * 添加 MCP 服务器
   */
  async addServer(config: MCPClientConfig): Promise<string[]> {
    const client = new MCPClient(config);
    await client.connect();

    const tools = await client.listTools();
    const toolNames: string[] = [];

    const toolMap = new Map<string, MCPTool>();
    for (const tool of tools) {
      const qualifiedName = `${config.name}__${tool.name}`;
      toolMap.set(qualifiedName, tool);
      toolNames.push(qualifiedName);
    }

    this.servers.set(config.name, { client, tools: toolMap });
    return toolNames;
  }

  /**
   * 移除 MCP 服务器
   */
  async removeServer(name: string): Promise<boolean> {
    const entry = this.servers.get(name);
    if (!entry) return false;

    await entry.client.disconnect();
    this.servers.delete(name);
    return true;
  }

  /**
   * 执行工具调用
   */
  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const { name, arguments: rawArgs } = toolCall.function;

    // 解析服务器名和工具名
    const separatorIndex = name.indexOf('__');
    if (separatorIndex === -1) {
      return this.err(toolCall, `Invalid MCP tool name format: ${name}. Expected: <server>__<tool>`);
    }

    const serverName = name.substring(0, separatorIndex);
    const toolName = name.substring(separatorIndex + 2);

    const entry = this.servers.get(serverName);
    if (!entry) {
      return this.err(toolCall, `MCP server not found: ${serverName}`);
    }

    if (!entry.tools.has(name)) {
      return this.err(toolCall, `MCP tool not found: ${name}`);
    }

    // 解析参数
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return this.err(toolCall, 'Invalid JSON arguments');
    }

    // 调用 MCP 工具
    try {
      const result = await entry.client.callTool(toolName, args);

      // 提取文本内容
      const texts = result.content
        ?.filter(c => c.type === 'text' && c.text)
        .map(c => c.text!) || [];

      const text = texts.join('\n');

      if (result.isError) {
        return { call_id: toolCall.id, tool_name: name, result: null, error: text };
      }

      return { call_id: toolCall.id, tool_name: name, result: text };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.err(toolCall, `MCP call failed: ${msg}`);
    }
  }

  /**
   * 列出所有可用的 MCP 工具
   */
  listTools(): string[] {
    const tools: string[] = [];
    for (const entry of this.servers.values()) {
      for (const toolName of entry.tools.keys()) {
        tools.push(toolName);
      }
    }
    return tools;
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    const separatorIndex = name.indexOf('__');
    if (separatorIndex === -1) return false;

    const serverName = name.substring(0, separatorIndex);
    const entry = this.servers.get(serverName);
    return entry?.tools.has(name) ?? false;
  }

  /**
   * 获取服务器数量
   */
  get serverCount(): number {
    return this.servers.size;
  }

  /**
   * 获取工具总数
   */
  get toolCount(): number {
    let count = 0;
    for (const entry of this.servers.values()) {
      count += entry.tools.size;
    }
    return count;
  }

  /**
   * 断开所有服务器
   */
  async disconnectAll(): Promise<void> {
    for (const entry of this.servers.values()) {
      await entry.client.disconnect();
    }
    this.servers.clear();
  }

  private err(toolCall: ToolCall, error: string): ToolResult {
    return { call_id: toolCall.id, tool_name: toolCall.function.name, result: null, error };
  }
}
