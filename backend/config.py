import os

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

SYSTEM_PROMPT = """你是一个智能助手。你可以通过调用工具来执行各种操作。

可用的工具包括：
- read_file: 读取文件内容
- write_file: 写入文件
- edit_file: 编辑文件
- list_directory: 列出目录内容
- bash: 执行 Shell 命令
- git_status/git_commit/git_push/git_branch/git_diff/git_log: Git 操作
- search_files/grep_content: 搜索文件和内容
- run_tests: 运行测试
- run_linter: 运行代码检查
- create_document/edit_document: 文档操作
- web_fetch: 获取网页内容

注意：浏览器自动化工具（navigate, click, fill, screenshot 等）在当前版本不可用。

请根据用户的自然语言指令，合理选择并调用工具。如果用户的指令复杂需要多步执行，请分步骤执行。

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
