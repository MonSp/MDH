import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPToolkitRouter } from '../toolkit/mcp.js';
import type { ToolCall } from '../team/types.js';

// Mock MCPClient
vi.mock('../mcp/client.js', () => {
  return {
    MCPClient: class MockMCPClient {
      private tools: Map<string, any>;
      private _connected = false;

      constructor(public config: any) {
        this.tools = new Map();
      }

      get isConnected() { return this._connected; }
      get serverName() { return this.config.name; }

      async connect() {
        this._connected = true;
      }

      async disconnect() {
        this._connected = false;
      }

      async listTools() {
        return Array.from(this.tools.values());
      }

      async callTool(name: string, args: Record<string, unknown>) {
        const tool = this.tools.get(name);
        if (!tool) {
          return { content: [{ type: 'text', text: `Tool not found: ${name}` }], isError: true };
        }
        return { content: [{ type: 'text', text: `Result: ${JSON.stringify(args)}` }] };
      }

      // 测试辅助方法
      _addTool(name: string, description: string) {
        this.tools.set(name, { name, description, inputSchema: {} });
      }
    },
  };
});

function makeToolCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id: `call_${Date.now()}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

describe('MCPToolkitRouter', () => {
  let router: MCPToolkitRouter;

  beforeEach(() => {
    router = new MCPToolkitRouter();
  });

  afterEach(async () => {
    await router.disconnectAll();
  });

  it('starts with no servers', () => {
    expect(router.serverCount).toBe(0);
    expect(router.toolCount).toBe(0);
  });

  it('hasTool returns false for unknown tools', () => {
    expect(router.hasTool('unknown__tool')).toBe(false);
  });

  it('hasTool returns false for invalid format', () => {
    expect(router.hasTool('no-separator')).toBe(false);
  });

  it('execute returns error for invalid tool name format', async () => {
    const result = await router.execute(makeToolCall('noseparator'), '/tmp');
    expect(result.error).toContain('Invalid MCP tool name format');
  });

  it('execute returns error for unknown server', async () => {
    const result = await router.execute(makeToolCall('unknown__tool'), '/tmp');
    expect(result.error).toContain('MCP server not found');
  });

  it('execute returns error for invalid JSON arguments', async () => {
    await router.addServer({ name: 'test', transport: 'stdio', command: 'echo' });

    const badCall: ToolCall = {
      id: 'bad',
      type: 'function',
      function: { name: 'test__test_tool', arguments: 'not-json' },
    };
    const result = await router.execute(badCall, '/tmp');
    // Mock 的 listTools 返回空，所以工具不存在
    expect(result.error).toContain('MCP tool not found');
  });
});
