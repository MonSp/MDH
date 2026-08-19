/**
 * Shell 命令安全模块
 *
 * 对齐 Python 端 tool_registry.py 的 SHELL_WHITELIST + SHELL_BLACKLIST_PATTERNS。
 */

// 允许执行的命令白名单
export const SHELL_WHITELIST = new Set([
  // 包管理
  'npm', 'npx', 'yarn', 'pnpm', 'pip', 'pip3', 'pipenv', 'poetry', 'conda',
  // 语言运行时
  'python', 'python3', 'node', 'deno', 'bun',
  // 版本控制
  'git',
  // 文件操作
  'ls', 'cat', 'mkdir', 'cp', 'mv', 'rm', 'touch', 'chmod', 'chown',
  // 搜索
  'grep', 'find', 'which', 'whereis',
  // 文本处理
  'echo', 'head', 'tail', 'wc', 'sort', 'uniq', 'diff', 'sed', 'awk',
  'tee', 'tr', 'cut', 'paste',
  // 测试/Lint
  'jest', 'pytest', 'tsc', 'eslint', 'prettier', 'vitest',
  'pylint', 'black', 'isort', 'mypy', 'flake8', 'ruff',
  // 构建
  'make', 'cmake', 'cargo', 'go',
  // 容器
  'docker',
  // 网络
  'curl', 'wget', 'ping', 'nslookup', 'dig', 'ssh', 'scp', 'rsync',
  // 压缩
  'tar', 'zip', 'unzip', 'gzip', 'gunzip',
  // 系统
  'date', 'env', 'pwd', 'whoami', 'df', 'du', 'free', 'top', 'ps',
  // 工具链
  'xargs',
]);

// 危险命令模式黑名单
export const SHELL_BLACKLIST_PATTERNS: RegExp[] = [
  // 删除根目录
  /\brm\s+-rf\s+\//i,
  /\brm\s+-rf\s+\/[^a-z]/i,
  // sudo
  /\bsudo\b/i,
  // 文件系统破坏
  /\bchmod\s+777\s+\//i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\//,
  // 系统控制
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  // Fork bomb
  /:\(\)\s*\{\s*:\|:\&\s*\}\s*;:/,
  // Pipe to shell（远程代码执行）
  /\bcurl\b.*\|.*\b(bash|sh|zsh)\b/i,
  /\bwget\b.*\|.*\b(bash|sh|zsh)\b/i,
  // eval injection
  /\beval\b.*\$/i,
  // Reverse shell
  /\bnc\s+-e\b/i,
  /\bncat\s+-e\b/i,
  // Python injection
  /python.*-c.*import\s+os/i,
];

/**
 * 校验 shell 命令安全性。
 * 返回 { safe: true } 或 { safe: false, reason: string }。
 */
export function validateShellCommand(command: string): { safe: true } | { safe: false; reason: string } {
  // 1. 黑名单检测
  for (const pattern of SHELL_BLACKLIST_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Blocked by blacklist pattern: ${pattern.source}` };
    }
  }

  // 2. 白名单检测（提取首个 token）
  const firstToken = command.trim().split(/\s+/)[0];
  // 去除可能的路径前缀（如 /usr/bin/git → git）
  const baseName = firstToken.split('/').pop() ?? firstToken;
  if (!SHELL_WHITELIST.has(baseName)) {
    return { safe: false, reason: `Command not in whitelist: ${baseName}` };
  }

  return { safe: true };
}
