import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { execSync } from 'node:child_process';
import { ToolCall, ToolResult } from '../team/types.js';
import { IToolkitRouter } from './router.js';

export class LocalToolkitRouter implements IToolkitRouter {
  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const { name, arguments: rawArgs } = toolCall.function;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return this.err(toolCall, 'Invalid JSON arguments');
    }

    // 确保 workspace 目录存在
    if (!existsSync(workspace)) {
      mkdirSync(workspace, { recursive: true });
    }

    try {
      const result = await this.dispatch(name, args, workspace);
      return { call_id: toolCall.id, tool_name: name, result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return this.err(toolCall, msg);
    }
  }

  private err(toolCall: ToolCall, error: string): ToolResult {
    return { call_id: toolCall.id, tool_name: toolCall.function.name, result: null, error };
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
    workspace: string,
  ): Promise<unknown> {
    switch (name) {
      case 'read_file':
        return this.readFile(args, workspace);
      case 'write_file':
        return this.writeFile(args, workspace);
      case 'edit_file':
        return this.editFile(args, workspace);
      case 'list_directory':
        return this.listDirectory(args, workspace);
      case 'bash':
        return this.bash(args, workspace);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private safePath(filePath: string, workspace: string): string {
    const abs = isAbsolute(filePath) ? filePath : resolve(workspace, filePath);
    const rel = relative(workspace, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path traversal denied: ${filePath}`);
    }
    return abs;
  }

  private readFile(args: Record<string, unknown>, workspace: string): string {
    const filePath = this.safePath(String(args.path), workspace);
    return readFileSync(filePath, 'utf-8');
  }

  private writeFile(args: Record<string, unknown>, workspace: string): string {
    const filePath = this.safePath(String(args.path), workspace);
    // 自动创建父目录
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, String(args.content), 'utf-8');
    return `Wrote ${filePath}`;
  }

  private editFile(args: Record<string, unknown>, workspace: string): string {
    const filePath = this.safePath(String(args.path), workspace);
    const oldText = String(args.old_string ?? args.old_text ?? '');
    const newText = String(args.new_string ?? args.new_text ?? '');
    const content = readFileSync(filePath, 'utf-8');
    if (!content.includes(oldText)) {
      throw new Error('old_string not found in file');
    }
    writeFileSync(filePath, content.replace(oldText, newText), 'utf-8');
    return `Edited ${filePath}`;
  }

  private listDirectory(args: Record<string, unknown>, workspace: string): string[] {
    const dirPath = args.path ? this.safePath(String(args.path), workspace) : workspace;
    return readdirSync(dirPath);
  }

  private bash(args: Record<string, unknown>, workspace: string): string {
    const cmd = String(args.command);
    const timeout = Number(args.timeout ?? 30_000);
    // 危险命令检测（与 Python executor 保持一致）
    const dangerous = [/rm\s+-rf\s+\/[^a-z]/i, /mkfs/i, /dd\s+if=/i, /:(){ :|:& };:/i, /chmod\s+-R\s+777\s+\//i];
    for (const pat of dangerous) {
      if (pat.test(cmd)) {
        throw new Error(`Blocked dangerous command: ${cmd}`);
      }
    }
    const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    return execSync(cmd, { cwd: workspace, timeout, encoding: 'utf-8', stderr: 'pipe', shell });
  }
}
