import type { ToolDefinition } from '../llm/types.js';
import { getTemplate } from '../team/templates.js';

export const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  // ========== 原有工具 ==========
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

  // ========== 新增 Git 工具 ==========
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: '查看 git 状态（简短格式）。提交前必须先检查。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: '暂存所有变更并提交代码。自动执行 git add -A。',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '提交信息' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: '推送代码到远程仓库。此操作不可逆，请确认后再执行。',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: '远程仓库名（默认 origin）' },
          branch: { type: 'string', description: '分支名' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description: '创建新分支（带名称）或列出所有分支（不带名称）。',
      parameters: {
        type: 'object',
        properties: {
          branch_name: { type: 'string', description: '新分支名。省略则列出所有分支。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: '查看代码变更差异。',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: '是否查看已暂存的变更', default: false },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: '查看最近的 git 提交历史。',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: '显示条数（默认 10）', default: 10 },
        },
      },
    },
  },

  // ========== 新增搜索工具 ==========
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '按文件名模式递归搜索文件。支持通配符 * 和 ?。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '文件名匹配模式（如 *.ts、config.*）' },
          path: { type: 'string', description: '搜索起始路径（默认 workspace 根目录）' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_content',
      description: '搜索文件内容（使用 grep 正则表达式）。',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索正则表达式' },
          path: { type: 'string', description: '搜索路径（默认当前目录）', default: '.' },
          include: { type: 'string', description: '文件类型过滤（如 *.ts）' },
        },
        required: ['pattern'],
      },
    },
  },

  // ========== 新增测试/Lint 工具 ==========
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: '运行项目测试套件（npm test）。',
      parameters: {
        type: 'object',
        properties: {
          test_path: { type: 'string', description: '指定测试文件路径' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_linter',
      description: '运行 ESLint 代码检查。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '检查路径（默认当前目录）', default: '.' },
        },
      },
    },
  },

  // ========== 新增文档工具 ==========
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: '创建或覆盖文档文件。功能同 write_file。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文档内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_document',
      description: '编辑文档的特定部分。功能同 edit_file。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_text: { type: 'string', description: '要替换的原文' },
          new_text: { type: 'string', description: '替换后的内容' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },

  // ========== 新增 Web 工具 ==========
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取网页内容（返回文本）。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要获取的 URL' },
        },
        required: ['url'],
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
