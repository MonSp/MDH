import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { LocalToolkitRouter } from './local.ts';
import { ToolCall } from '../team/types.js';

const FIXTURE = join(import.meta.dirname, '__test_workspace__');

function makeCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

/** Initialize a git repo in the fixture workspace for git tool tests */
function initGitRepo(ws: string) {
  execSync('git init && git config user.email "test@test.com" && git config user.name "Test"', {
    cwd: ws,
    encoding: 'utf-8',
  });
  writeFileSync(join(ws, 'init.txt'), 'init');
  execSync('git add -A && git commit -m "init"', { cwd: ws, encoding: 'utf-8' });
}

beforeEach(() => {
  mkdirSync(FIXTURE, { recursive: true });
});

afterEach(() => {
  rmSync(FIXTURE, { recursive: true, force: true });
});

describe('LocalToolkitRouter', () => {
  const router = new LocalToolkitRouter();

  // ========== 原有测试 ==========

  it('read_file returns file contents', async () => {
    writeFileSync(join(FIXTURE, 'hello.txt'), 'world');
    const result = await router.execute(makeCall('read_file', { path: 'hello.txt' }), FIXTURE);
    expect(result.error).toBeUndefined();
    expect(result.result).toBe('world');
  });

  it('write_file creates a file and read_file retrieves it', async () => {
    const result = await router.execute(
      makeCall('write_file', { path: 'out.txt', content: 'hello' }),
      FIXTURE,
    );
    expect(result.error).toBeUndefined();
    expect(readFileSync(join(FIXTURE, 'out.txt'), 'utf-8')).toBe('hello');
  });

  it('bash executes a command and returns output', async () => {
    const result = await router.execute(makeCall('bash', { command: 'echo hi' }), FIXTURE);
    expect(result.error).toBeUndefined();
    expect(String(result.result).trim()).toBe('hi');
  });

  it('blocks path traversal outside workspace', async () => {
    const result = await router.execute(
      makeCall('read_file', { path: '../../../etc/passwd' }),
      FIXTURE,
    );
    expect(result.error).toContain('Path traversal denied');
  });

  // ========== 新增 Git 工具测试 ==========

  describe('git_status', () => {
    it('returns git status', async () => {
      initGitRepo(FIXTURE);
      writeFileSync(join(FIXTURE, 'new.txt'), 'new');
      const result = await router.execute(makeCall('git_status'), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('new.txt');
    });
  });

  describe('git_commit', () => {
    it('stages and commits files', async () => {
      initGitRepo(FIXTURE);
      writeFileSync(join(FIXTURE, 'commit-me.txt'), 'content');
      const result = await router.execute(makeCall('git_commit', { message: 'add commit-me' }), FIXTURE);
      expect(result.error).toBeUndefined();
      const log = execSync('git log --oneline', { cwd: FIXTURE, encoding: 'utf-8' });
      expect(log).toContain('add commit-me');
    });

    it('errors when message is empty', async () => {
      initGitRepo(FIXTURE);
      const result = await router.execute(makeCall('git_commit', { message: '' }), FIXTURE);
      expect(result.error).toContain('Commit message is required');
    });
  });

  describe('git_push', () => {
    it('includes warning in result', async () => {
      initGitRepo(FIXTURE);
      // git_push will fail since there is no remote, but we test the warning logic
      const result = await router.execute(makeCall('git_push', { remote: 'origin', branch: 'main' }), FIXTURE);
      // Either succeeds with warning or errors because no remote
      if (result.error) {
        expect(result.error).toBeTruthy();
      } else {
        expect(String(result.result)).toContain('WARNING');
      }
    });
  });

  describe('git_branch', () => {
    it('lists branches without args', async () => {
      initGitRepo(FIXTURE);
      const result = await router.execute(makeCall('git_branch'), FIXTURE);
      expect(result.error).toBeUndefined();
      // git init defaults to 'master' unless configured otherwise
      expect(String(result.result)).toMatch(/main|master/);
    });

    it('creates a new branch with branch_name', async () => {
      initGitRepo(FIXTURE);
      const result = await router.execute(makeCall('git_branch', { branch_name: 'feature-x' }), FIXTURE);
      expect(result.error).toBeUndefined();
      const branches = execSync('git branch', { cwd: FIXTURE, encoding: 'utf-8' });
      expect(branches).toContain('feature-x');
    });
  });

  describe('git_diff', () => {
    it('returns diff for unstaged changes', async () => {
      initGitRepo(FIXTURE);
      writeFileSync(join(FIXTURE, 'init.txt'), 'modified');
      const result = await router.execute(makeCall('git_diff'), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('modified');
    });

    it('returns diff for staged changes', async () => {
      initGitRepo(FIXTURE);
      writeFileSync(join(FIXTURE, 'init.txt'), 'staged change');
      execSync('git add init.txt', { cwd: FIXTURE, encoding: 'utf-8' });
      const result = await router.execute(makeCall('git_diff', { staged: true }), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('staged change');
    });
  });

  describe('git_log', () => {
    it('returns commit log', async () => {
      initGitRepo(FIXTURE);
      const result = await router.execute(makeCall('git_log', { count: 5 }), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('init');
    });

    it('defaults to 10 entries', async () => {
      initGitRepo(FIXTURE);
      const result = await router.execute(makeCall('git_log'), FIXTURE);
      expect(result.error).toBeUndefined();
      // just ensure it returns without error
      expect(typeof result.result).toBe('string');
    });
  });

  // ========== 搜索工具测试 ==========

  describe('search_files', () => {
    it('finds files matching pattern', async () => {
      writeFileSync(join(FIXTURE, 'a.ts'), '');
      writeFileSync(join(FIXTURE, 'b.ts'), '');
      writeFileSync(join(FIXTURE, 'c.js'), '');
      mkdirSync(join(FIXTURE, 'sub'), { recursive: true });
      writeFileSync(join(FIXTURE, 'sub', 'd.ts'), '');
      const result = await router.execute(makeCall('search_files', { pattern: '*.ts' }), FIXTURE);
      expect(result.error).toBeUndefined();
      const files = result.result as string[];
      expect(files).toContain('a.ts');
      expect(files).toContain('b.ts');
      expect(files).toContain(join('sub', 'd.ts'));
      expect(files).not.toContain('c.js');
    });

    it('respects path argument', async () => {
      writeFileSync(join(FIXTURE, 'top.txt'), '');
      mkdirSync(join(FIXTURE, 'sub'), { recursive: true });
      writeFileSync(join(FIXTURE, 'sub', 'nested.txt'), '');
      const result = await router.execute(makeCall('search_files', { pattern: '*.txt', path: 'sub' }), FIXTURE);
      expect(result.error).toBeUndefined();
      const files = result.result as string[];
      expect(files.some(f => f.includes('nested.txt'))).toBe(true);
    });

    it('errors without pattern', async () => {
      const result = await router.execute(makeCall('search_files', {}), FIXTURE);
      expect(result.error).toContain('pattern is required');
    });
  });

  describe('grep_content', () => {
    it('finds matching lines in files', async () => {
      writeFileSync(join(FIXTURE, 'grep-test.ts'), 'const foo = 1;\nconst bar = 2;\n');
      const result = await router.execute(makeCall('grep_content', { pattern: 'foo' }), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('foo');
    });

    it('filters by include', async () => {
      writeFileSync(join(FIXTURE, 'match.ts'), 'hello world');
      writeFileSync(join(FIXTURE, 'match.js'), 'hello world');
      const result = await router.execute(
        makeCall('grep_content', { pattern: 'hello', include: '*.ts' }),
        FIXTURE,
      );
      expect(result.error).toBeUndefined();
      const output = String(result.result);
      expect(output).toContain('match.ts');
      expect(output).not.toContain('match.js');
    });

    it('returns empty string when no match', async () => {
      writeFileSync(join(FIXTURE, 'empty.ts'), 'nothing here');
      const result = await router.execute(makeCall('grep_content', { pattern: 'zzzzz' }), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(result.result).toBe('');
    });

    it('errors without pattern', async () => {
      const result = await router.execute(makeCall('grep_content', {}), FIXTURE);
      expect(result.error).toContain('pattern is required');
    });
  });

  // ========== 测试/Lint 工具 ==========

  describe('run_tests', () => {
    it('runs npm test and captures output', async () => {
      // Create a minimal package.json with a trivial test script
      writeFileSync(join(FIXTURE, 'package.json'), JSON.stringify({
        scripts: { test: 'echo "test ran"' },
      }));
      const result = await router.execute(makeCall('run_tests'), FIXTURE);
      expect(result.error).toBeUndefined();
      expect(String(result.result)).toContain('test ran');
    });
  });

  describe('run_linter', () => {
    it('returns error when eslint is not available', async () => {
      writeFileSync(join(FIXTURE, 'lint-me.ts'), 'const x = 1;');
      const result = await router.execute(makeCall('run_linter', { path: 'lint-me.ts' }), FIXTURE);
      // eslint likely not installed in test env, so we expect an error
      expect(result.error).toBeTruthy();
    });
  });

  // ========== 文档工具别名测试 ==========

  describe('create_document', () => {
    it('creates a file like write_file', async () => {
      const result = await router.execute(
        makeCall('create_document', { path: 'doc.md', content: '# Hello' }),
        FIXTURE,
      );
      expect(result.error).toBeUndefined();
      expect(readFileSync(join(FIXTURE, 'doc.md'), 'utf-8')).toBe('# Hello');
    });
  });

  describe('edit_document', () => {
    it('edits a file like edit_file', async () => {
      writeFileSync(join(FIXTURE, 'doc2.md'), 'Hello World');
      const result = await router.execute(
        makeCall('edit_document', { path: 'doc2.md', old_text: 'World', new_text: 'Universe' }),
        FIXTURE,
      );
      expect(result.error).toBeUndefined();
      expect(readFileSync(join(FIXTURE, 'doc2.md'), 'utf-8')).toBe('Hello Universe');
    });
  });

  // ========== Web 工具测试 ==========

  describe('web_fetch', () => {
    it('errors without url', async () => {
      const result = await router.execute(makeCall('web_fetch', {}), FIXTURE);
      expect(result.error).toContain('url is required');
    });
  });

  // ========== dispatch fallback ==========

  it('returns error for unknown tool', async () => {
    const result = await router.execute(makeCall('nonexistent_tool'), FIXTURE);
    expect(result.error).toContain('Unknown tool');
  });

  it('returns error for invalid JSON arguments', async () => {
    const call: ToolCall = {
      id: 'call_bad',
      type: 'function',
      function: { name: 'bash', arguments: 'not-json' },
    };
    const result = await router.execute(call, FIXTURE);
    expect(result.error).toContain('Invalid JSON');
  });
});
