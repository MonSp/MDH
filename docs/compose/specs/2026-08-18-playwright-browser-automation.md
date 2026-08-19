# Playwright 浏览器自动化设计方案

## 一、背景

MDH 原有 22 个浏览器工具依赖自研 Chrome 扩展，与开源项目脱节。需要用 Playwright 替代，实现标准化的浏览器自动化能力。

## 二、架构

```
┌─────────────────────────────────────────────────────────┐
│  Agent (RoleAgent / MeetingCoordinator)                  │
│  通过工具调用控制浏览器                                     │
└─────────────────┬───────────────────────────────────────┘
                  │ tool_call
                  ▼
┌─────────────────────────────────────────────────────────┐
│  TS Orchestrator                                         │
│  orchestrator/src/toolkit/browser.ts                     │
│  - PlaywrightBrowser 类（管理浏览器实例）                   │
│  - 22 个工具定义 + 执行器                                  │
│  - 通过 LocalToolkitRouter 暴露                           │
└─────────────────┬───────────────────────────────────────┘
                  │ Playwright API
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Chromium (headless/headed)                              │
│  - 支持多标签页                                            │
│  - 支持截图                                               │
│  - 支持 JavaScript 执行                                   │
└─────────────────────────────────────────────────────────┘
```

## 三、工具清单（22 个）

### 导航工具（4 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `navigate` | `url: string` | 导航到指定 URL |
| `go_back` | 无 | 浏览器后退 |
| `go_forward` | 无 | 浏览器前进 |
| `reload` | 无 | 刷新当前页面 |

### 交互工具（7 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `click` | `selector: string` | 点击元素 |
| `fill` | `selector: string, value: string` | 填写表单输入框 |
| `type_text` | `selector: string, text: string, delay?: number` | 逐字输入文本 |
| `press_key` | `key: string` | 按下键盘按键 |
| `hover` | `selector: string` | 悬停在元素上 |
| `select` | `selector: string, value: string` | 选择下拉框选项 |
| `scroll` | `direction: 'up'|'down'|'left'|'right', amount?: number` | 滚动页面 |

### 查询工具（6 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `get_text` | `selector: string` | 获取元素文本内容 |
| `get_attribute` | `selector: string, attribute: string` | 获取元素属性值 |
| `get_url` | 无 | 获取当前页面 URL |
| `get_title` | 无 | 获取当前页面标题 |
| `query` | `selector: string` | 查询元素是否存在及基本信息 |
| `wait_for` | `selector: string, state?: 'visible'|'hidden'|'attached'` | 等待元素达到指定状态 |

### 截图工具（2 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `screenshot` | `path?: string` | 全页面截图，返回 base64 |
| `screenshot_element` | `selector: string, path?: string` | 元素截图 |

### 标签页工具（4 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `list_tabs` | 无 | 列出所有打开的标签页 |
| `switch_tab` | `tab_id: string` | 切换到指定标签页 |
| `new_tab` | `url?: string` | 新建标签页 |
| `close_tab` | `tab_id: string` | 关闭指定标签页 |

### 高级工具（2 个）
| 工具 | 参数 | 说明 |
|------|------|------|
| `evaluate_js` | `code: string` | 在当前页面执行 JavaScript |
| `execute_steps` | `steps: Array<{action, selector?, value?, key?}>` | 批量执行步骤 |

**总计：25 个工具**

## 四、核心组件

### 4.1 PlaywrightBrowser 类
- 管理 Playwright 浏览器实例的生命周期
- 支持 headless/headed 模式
- 支持多标签页管理
- 截图保存到工作区目录

### 4.2 工具注册
- 在 `orchestrator/src/agent/tools.ts` 中添加 25 个工具定义
- 在 `orchestrator/src/toolkit/local.ts` 中添加执行器
- 通过 `LocalToolkitRouter` 暴露给 Agent

### 4.3 配置
- `PLAYWRIGHT_HEADLESS=true` — 无头模式（默认）
- `PLAYWRIGHT_BROWSER=chromium` — 浏览器类型（默认 chromium）
- `PLAYWRIGHT_TIMEOUT=30000` — 默认超时（30s）

## 五、依赖

```json
{
  "dependencies": {
    "playwright": "^1.40.0"
  }
}
```

## 六、测试策略

- 每个工具独立单元测试
- 集成测试：导航 → 交互 → 查询 → 截图 完整流程
- 使用本地 HTML 文件作为测试页面

## 七、安全考虑

- 截图路径限制在工作区内
- JavaScript 执行有超时保护
- 浏览器实例在 Agent 结束时自动关闭
- 敏感操作（如表单提交）需要 HITL 确认
