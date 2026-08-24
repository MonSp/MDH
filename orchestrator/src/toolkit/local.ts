import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { execSync } from 'node:child_process';
import { ToolCall, ToolResult } from '../team/types.js';
import { IToolkitRouter } from './router.js';
import { validateShellCommand } from './shellSafety.js';
import { PlaywrightBrowser } from './browser.js';

export class LocalToolkitRouter implements IToolkitRouter {
  private browser: PlaywrightBrowser | null = null;

  private getBrowser(): PlaywrightBrowser {
    if (!this.browser) {
      this.browser = new PlaywrightBrowser();
    }
    return this.browser;
  }
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
      // --- 原有 5 个工具 ---
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
      // --- 新增 13 个工具 ---
      case 'git_status':
        return this.gitStatus(workspace);
      case 'git_commit':
        return this.gitCommit(args, workspace);
      case 'git_push':
        return this.gitPush(args, workspace);
      case 'git_branch':
        return this.gitBranch(args, workspace);
      case 'git_diff':
        return this.gitDiff(args, workspace);
      case 'git_log':
        return this.gitLog(args, workspace);
      case 'search_files':
        return this.searchFiles(args, workspace);
      case 'grep_content':
        return this.grepContent(args, workspace);
      case 'run_tests':
        return this.runTests(args, workspace);
      case 'run_linter':
        return this.runLinter(args, workspace);
      case 'create_document':
        return this.writeFile({ path: args.path, content: args.content }, workspace);
      case 'edit_document':
        return this.editFile({ path: args.path, old_string: args.old_text, new_string: args.new_text }, workspace);
      case 'web_fetch':
        return this.webFetch(args);
      // --- 浏览器自动化工具 (Playwright) ---
      case 'navigate':
        return this.getBrowser().navigate(String(args.url));
      case 'click':
        return this.getBrowser().click(String(args.selector));
      case 'fill':
        return this.getBrowser().fill(String(args.selector), String(args.value));
      case 'type_text':
        return this.getBrowser().typeText(String(args.selector), String(args.text), args.delay as number | undefined);
      case 'press_key':
        return this.getBrowser().pressKey(String(args.key));
      case 'hover':
        return this.getBrowser().hover(String(args.selector));
      case 'select':
        return this.getBrowser().select(String(args.selector), String(args.value));
      case 'scroll':
        return this.getBrowser().scroll(args.direction as 'up' | 'down' | 'left' | 'right', args.amount as number | undefined);
      case 'get_text':
        return this.getBrowser().getText(String(args.selector));
      case 'get_attribute':
        return this.getBrowser().getAttribute(String(args.selector), String(args.attribute));
      case 'get_url':
        return this.getBrowser().getUrl();
      case 'get_title':
        return this.getBrowser().getTitle();
      case 'query':
        return this.getBrowser().query(String(args.selector));
      case 'wait_for':
        return this.getBrowser().waitFor(String(args.selector), (args.state as 'visible' | 'hidden' | 'attached') || 'visible');
      case 'screenshot':
        return this.getBrowser().screenshot(args.path as string | undefined);
      case 'screenshot_element':
        return this.getBrowser().screenshotElement(String(args.selector), args.path as string | undefined);
      case 'list_tabs':
        return this.getBrowser().listTabs();
      case 'switch_tab':
        return this.getBrowser().switchTab(String(args.tab_id));
      case 'new_tab':
        return this.getBrowser().newTab(args.url as string | undefined);
      case 'close_tab':
        return this.getBrowser().closeTab(String(args.tab_id));
      case 'evaluate_js':
        return this.getBrowser().evaluateJs(String(args.code));
      case 'execute_steps':
        return this.getBrowser().executeSteps(args.steps as Array<{ action: string; selector?: string; value?: string; key?: string }>);
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

  // ========== 原有 5 个工具 ==========

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

    // Shell 命令安全校验
    const validation = validateShellCommand(cmd);
    if (!validation.safe) {
      throw new Error(`Blocked: ${validation.reason}`);
    }

    const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    return execSync(cmd, { cwd: workspace, timeout, encoding: 'utf-8', shell } as any);
  }

  // ========== 新增 13 个工具 ==========

  // --- Git 工具 (6) ---

  private gitStatus(workspace: string): string {
    return execSync('git status --short', { cwd: workspace, encoding: 'utf-8' });
  }

  private gitCommit(args: Record<string, unknown>, workspace: string): string {
    const message = String(args.message ?? '');
    if (!message) throw new Error('Commit message is required');
    execSync('git add -A', { cwd: workspace, encoding: 'utf-8' });
    return execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: workspace, encoding: 'utf-8' });
  }

  private gitPush(args: Record<string, unknown>, workspace: string): string {
    const remote = args.remote ? String(args.remote) : '';
    const branch = args.branch ? String(args.branch) : '';
    const cmd = ['git push', remote, branch].filter(Boolean).join(' ');
    return execSync(cmd, { cwd: workspace, encoding: 'utf-8' })
      + '\n⚠️ WARNING: This command pushed to remote. Ensure changes are reviewed.';
  }

  private gitBranch(args: Record<string, unknown>, workspace: string): string {
    const branchName = args.branch_name ? String(args.branch_name) : '';
    if (branchName) {
      return execSync(`git checkout -b ${JSON.stringify(branchName)}`, { cwd: workspace, encoding: 'utf-8' });
    }
    return execSync('git branch', { cwd: workspace, encoding: 'utf-8' });
  }

  private gitDiff(args: Record<string, unknown>, workspace: string): string {
    const staged = args.staged === true || args.staged === 'true';
    const cmd = staged ? 'git diff --staged' : 'git diff';
    return execSync(cmd, { cwd: workspace, encoding: 'utf-8' });
  }

  private gitLog(args: Record<string, unknown>, workspace: string): string {
    const count = Number(args.count ?? 10);
    return execSync(`git log -${count} --oneline`, { cwd: workspace, encoding: 'utf-8' });
  }

  // --- 搜索工具 (2) ---

  private searchFiles(args: Record<string, unknown>, workspace: string): string[] {
    const pattern = String(args.pattern ?? '');
    if (!pattern) throw new Error('pattern is required');
    const searchPath = args.path ? this.safePath(String(args.path), workspace) : workspace;
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
    const results: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          walk(full);
        } else {
          if (regex.test(entry.name)) {
            results.push(relative(workspace, full));
          }
        }
      }
    };
    walk(searchPath);
    return results;
  }

  private grepContent(args: Record<string, unknown>, workspace: string): string {
    const pattern = String(args.pattern ?? '');
    if (!pattern) throw new Error('pattern is required');
    const searchPath = args.path ? String(args.path) : '.';
    const include = args.include ? String(args.include) : '';
    let cmd = `grep -rn ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)}`;
    if (include) {
      cmd += ` --include=${JSON.stringify(include)}`;
    }
    try {
      return execSync(cmd, { cwd: workspace, encoding: 'utf-8', timeout: 30_000 });
    } catch (e: unknown) {
      // grep returns exit code 1 when no match
      if (e instanceof Error && 'status' in e && (e as { status: number }).status === 1) {
        return '';
      }
      throw e;
    }
  }

  // --- 测试/lint 工具 (2) ---

  private runTests(args: Record<string, unknown>, workspace: string): string {
    const testPath = args.test_path ? String(args.test_path) : '';
    const cmd = testPath ? `npm test -- ${JSON.stringify(testPath)}` : 'npm test';
    try {
      return execSync(cmd, { cwd: workspace, encoding: 'utf-8', timeout: 120_000 });
    } catch (e: unknown) {
      // npm test returns non-zero on failure; surface the output
      if (e instanceof Error && 'stdout' in e) {
        const stdout = (e as { stdout: string }).stdout;
        return stdout + '\n⚠️ WARNING: Tests exited with non-zero code.';
      }
      throw e;
    }
  }

  private runLinter(args: Record<string, unknown>, workspace: string): string {
    const path = args.path ? String(args.path) : '.';
    return execSync(`eslint ${JSON.stringify(path)}`, { cwd: workspace, encoding: 'utf-8', timeout: 60_000 });
  }

  // --- 文档工具 ---

  // create_document → delegates to writeFile (in dispatch)
  // edit_document → delegates to editFile (in dispatch)

  // --- Web 工具 (1) ---

  private async webFetch(args: Record<string, unknown>): Promise<string> {
    const url = String(args.url ?? '');
    if (!url) throw new Error('url is required');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }
}
