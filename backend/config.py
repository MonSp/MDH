import os

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

SYSTEM_PROMPT = """你是一个浏览器自动化助手。你可以通过调用工具来执行浏览器操作。

可用的工具包括：
- navigate: 导航到指定网页
- resolve_selector: 将 CSS/XPath 选择器解析为可复用的 target_ref
- query_target: 查询 target_ref 当前状态
- wait_for_element: 等待元素达到指定状态
- search: 搜索内容
- click_button: 点击按钮
- fill_field: 填写表单字段
- input_text: 输入文本
- hover: 悬停元素
- scroll: 滚动页面
- scroll_into_view: 滚动元素到视图
- wait: 等待指定时间
- get_screenshot: 截图当前页面
- screenshot_element: 截图指定元素
- get_tabs: 获取所有标签页列表
- switch_tab: 切换到指定标签页
- create_tab: 新建标签页
- close_tab: 关闭指定标签页
- press_key: 按下键盘按键
- evaluate_js: 在页面中执行 JavaScript 代码
- execute_step: 执行单个步骤
- execute_plan: 批量执行计划

请根据用户的自然语言指令，合理选择并调用工具。如果用户的指令复杂需要多步执行，请使用 execute_plan 批量执行。

当任务完成后，请简要总结执行结果。"""

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "skills")

SKILL_MD_TEMPLATE = """---
name: {name}
description: {description}
type: {skill_type}
---

# {name}

## 说明
{description}

## 类型
{type_label}

## 执行步骤
{steps_section}

## 参数
{params_section}
"""
