/**
 * MCP Client — JSON-RPC 2.0 over Stdio/HTTP
 *
 * 封装 MCP 协议通信，支持：
 * - Stdio 传输（本地进程）
 * - 工具发现（tools/list）
 * - 工具调用（tools/call）
 * - 资源发现（resources/list）
 * - 资源读取（resources/read）
 */

import { type ChildProcess, spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

export interface MCPClientConfig {
  name: string;
  transport: 'stdio' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * MCPClient — 与 MCP 服务器通信的客户端
 *
 * 用法：
 *   const client = new MCPClient({ name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fs', '/tmp'] });
 *   await client.connect();
 *   const tools = await client.listTools();
 *   const result = await client.callTool('read_file', { path: '/tmp/test.txt' });
 *   await client.disconnect();
 */
export class MCPClient {
  private config: MCPClientConfig;
  private process: ChildProcess | null = null;
  private stdin: Writable | null = null;
  private stdout: Readable | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private connected = false;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get serverName(): string {
    return this.config.name;
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else {
      throw new Error(`Unsupported transport: ${this.config.transport}`);
    }

    // 发送 initialize 请求
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mdh-orchestrator', version: '1.0.0' },
    });

    // 发送 initialized 通知
    this.sendNotification('notifications/initialized', {});

    this.connected = true;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.pending.clear();
    this.buffer = '';
  }

  /**
   * 列出服务器提供的工具
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {}) as { tools?: MCPTool[] };
    return result.tools || [];
  }

  /**
   * 调用服务器工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result as MCPToolResult;
  }

  /**
   * 列出服务器资源
   */
  async listResources(): Promise<MCPResource[]> {
    const result = await this.sendRequest('resources/list', {}) as { resources?: MCPResource[] };
    return result.resources || [];
  }

  /**
   * 读取资源内容
   */
  async readResource(uri: string): Promise<string> {
    const result = await this.sendRequest('resources/read', { uri }) as {
      contents?: Array<{ text?: string }>;
    };
    return result.contents?.[0]?.text || '';
  }

  // ── Private ──

  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error('No command specified for stdio transport');
    }

    const env = this.config.env
      ? { ...process.env, ...this.config.env }
      : undefined;

    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    this.stdin = this.process.stdin!;
    this.stdout = this.process.stdout!;

    // 设置响应解析
    this.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      // stderr 用于日志，忽略
    });

    this.process.on('exit', () => {
      this.connected = false;
      // 拒绝所有待处理请求
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Process exited'));
      }
      this.pending.clear();
    });

    // 等待进程启动
    await new Promise<void>((resolve, reject) => {
      this.process!.on('error', reject);
      setTimeout(resolve, 100);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id !== undefined && this.pending.has(response.id)) {
          const { resolve, reject } = this.pending.get(response.id)!;
          this.pending.delete(response.id);
          if (response.error) {
            reject(new Error(response.error.message || 'MCP error'));
          } else {
            resolve(response.result);
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pending.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.stdin!.write(message);

      // 超时处理
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const message = JSON.stringify(notification) + '\n';
    this.stdin!.write(message);
  }
}
