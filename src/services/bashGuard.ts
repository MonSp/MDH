/**
 * Electron bash 工具命令守卫
 *
 * Electron 是纯 Node.js 离线模式（无 Python、无公网）。
 * 拦截 LLM 通过 bash 工具调用 python/pip/conda 等命令，
 * 引导其使用 node 完成验证和脚本任务。
 *
 * 纯函数，无 electron 依赖，便于单元测试。
 */

const BLOCKED_CMD_PREFIXES = ['python', 'python2', 'python3', 'pip', 'pip3', 'conda', 'py '];

export const BLOCKED_COMMAND_MESSAGE =
  '本环境为纯 Node.js 离线模式，无 Python。请改用 Node.js（node 命令）完成验证和脚本任务。';

/**
 * 判断 bash 命令是否命中禁用前缀
 * @param cmd 完整命令字符串
 * @returns true 表示该命令被拦截
 */
export function isBlockedBashCommand(cmd: string): boolean {
  const trimmed = (cmd || '').trim();
  if (!trimmed) return false;
  return BLOCKED_CMD_PREFIXES.some(p => {
    const prefix = p.endsWith(' ') ? p : p + ' '; // 'py ' 已含空格，其余补一个
    return trimmed === p || trimmed.startsWith(prefix);
  });
}
