interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: '导航到指定的网页地址',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整的URL地址，如 https://github.com' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: '在浏览器中搜索指定关键词',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click_button',
      description: '点击页面上的按钮或元素',
      parameters: {
        type: 'object',
        properties: {
          button_label: { type: 'string', description: '按钮或元素的文字标签' },
        },
        required: ['button_label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_field',
      description: '在指定输入框中填入内容',
      parameters: {
        type: 'object',
        properties: {
          field_name: { type: 'string', description: '输入框的名称或描述' },
          value: { type: 'string', description: '要填入的内容' },
        },
        required: ['field_name', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'login',
      description: '使用用户名和密码登录',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: '用户名' },
          password: { type: 'string', description: '密码' },
        },
        required: ['username', 'password'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: '滚动页面',
      parameters: {
        type: 'object',
        properties: {
          y: { type: 'integer', description: '垂直滚动像素数，正值向下，负值向上' },
          behavior: { type: 'string', description: '滚动行为', enum: ['smooth', 'auto'] },
        },
        required: ['y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: '等待指定时长',
      parameters: {
        type: 'object',
        properties: {
          timeout_ms: { type: 'integer', description: '等待时长，单位毫秒' },
        },
        required: ['timeout_ms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_screenshot',
      description: '截取当前页面的截图',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tabs',
      description: '获取所有浏览器标签页列表',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: '切换到指定的标签页',
      parameters: {
        type: 'object',
        properties: {
          tab_id: { type: 'integer', description: '标签页ID' },
        },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_tab',
      description: '新建一个标签页，可选择指定URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '新标签页要打开的URL（可选）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: '关闭指定的标签页',
      parameters: {
        type: 'object',
        properties: {
          tab_id: { type: 'integer', description: '要关闭的标签页ID' },
        },
        required: ['tab_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: '按下指定的键盘按键',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '按键名称，如 Enter, Escape, Tab 等' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_js',
      description: '在页面中执行JavaScript代码',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的JavaScript代码' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_plan',
      description: '执行一个多步骤的浏览器操作计划',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: '步骤数组，每个步骤包含 command 和 payload',
          },
          stop_on_error: { type: 'boolean', description: '遇到错误时是否停止' },
        },
        required: ['steps'],
      },
    },
  },
];

export const DEFAULT_SYSTEM_PROMPT = `你是一个浏览器自动化助手。根据用户的自然语言指令，调用合适的工具函数来执行浏览器操作。如果用户输入无法匹配任何可用工具，请用中文友好地回复用户，说明你暂时无法处理这个请求，并举例说明可以执行的操作用户指令: {user_message}`;
