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

  // ========== 浏览器自动化工具 (Playwright) ==========
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: '导航到指定网页。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标 URL' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description: '点击页面上的元素。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill',
      description: '填写表单输入框。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '要填写的值' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: '逐字输入文本（模拟键盘输入）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          text: { type: 'string', description: '要输入的文本' },
          delay: { type: 'number', description: '每个字符的延迟（毫秒）' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: '按下键盘按键。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '按键名称（如 Enter, Tab, Escape）' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hover',
      description: '悬停在元素上。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select',
      description: '选择下拉框选项。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '选项值' },
        },
        required: ['selector', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: '滚动页面。',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
          amount: { type: 'number', description: '滚动像素值（默认 500）' },
        },
        required: ['direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_text',
      description: '获取元素文本内容。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attribute',
      description: '获取元素属性值。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          attribute: { type: 'string', description: '属性名' },
        },
        required: ['selector', 'attribute'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_url',
      description: '获取当前页面 URL。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_title',
      description: '获取当前页面标题。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query',
      description: '查询元素是否存在及基本信息。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for',
      description: '等待元素达到指定状态。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          state: { type: 'string', enum: ['visible', 'hidden', 'attached'], description: '目标状态' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: '全页面截图，返回 base64 编码的图片。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '保存路径（可选）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screenshot_element',
      description: '对指定元素截图。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          path: { type: 'string', description: '保存路径（可选）' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: '列出所有打开的标签页。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: '切换到指定标签页。',
      parameters: {
        type: 'object',
        properties: {
          tab_id: { type: 'string', description: '标签页 ID' },
        },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'new_tab',
      description: '新建标签页。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '初始 URL（可选）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: '关闭指定标签页。',
      parameters: {
        type: 'object',
        properties: {
          tab_id: { type: 'string', description: '标签页 ID' },
        },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_js',
      description: '在当前页面执行 JavaScript 代码。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript 代码' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_steps',
      description: '批量执行浏览器步骤。',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: '步骤列表',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: '动作（navigate/click/fill/type/press/hover/wait）' },
                selector: { type: 'string', description: 'CSS 选择器' },
                value: { type: 'string', description: '值' },
                key: { type: 'string', description: '按键' },
              },
              required: ['action'],
            },
          },
        },
        required: ['steps'],
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

/**
 * 校验工具调用参数。
 * 对应 Python 侧 ToolRegistry.validate_tool_call()
 */
export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
): { valid: true } | { valid: false; error: string } {
  const toolDef = ALL_TOOL_DEFINITIONS.find(t => t.function.name === toolName);
  if (!toolDef) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const required = (toolDef.function.parameters.required as string[]) ?? [];
  for (const param of required) {
    if (args[param] === undefined || args[param] === null || args[param] === '') {
      return { valid: false, error: `Missing required parameter: ${param}` };
    }
  }

  return { valid: true };
}
