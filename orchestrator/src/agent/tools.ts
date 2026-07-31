import type { ToolDefinition } from '../llm/types.js';
import { getTemplate } from '../team/templates.js';

export const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '创建或覆盖文件。用这个工具创建代码文件，不要用bash的echo/cat/heredoc。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对于workspace）' },
          content: { type: 'string', description: '完整的文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容。修改文件前必须先读取。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '编辑文件的特定部分。用 old_string 定位，new_string 替换。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_string: { type: 'string', description: '要替换的原文' },
          new_string: { type: 'string', description: '替换后的内容' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录内容。开始任务前先用这个了解环境。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '目录路径', default: '.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '执行Shell命令。只用于运行测试、安装依赖、git操作等，不要用来创建文件。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeout: { type: 'number', description: '超时秒数', default: 30 },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_content',
      description: '搜索文件内容',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式' },
          path: { type: 'string', default: '.' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: '查看 git 状态。提交前必须先检查。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: '查看代码变更',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: '提交代码',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: '提交信息' } },
        required: ['message'],
      },
    },
  },
];

/**
 * 根据角色配置过滤可用工具。
 * 对应 Python 侧 AgentToolset._filter_tools()
 */
export function getToolsForRole(roleId: string): ToolDefinition[] {
  const template = getTemplate(roleId);
  if (!template) return ALL_TOOL_DEFINITIONS;

  const allowed = new Set(template.tools);
  return ALL_TOOL_DEFINITIONS.filter(td => allowed.has(td.function.name));
}
