ONBOARDING_TASKS = [
    {
        "index": 0,
        "title": "探索项目结构",
        "description": "分析当前项目的目录结构，列出主要模块和它们的用途",
        "difficulty": "简单",
        "expected_path": "simple",
        "xp_reward": 15,
        "skill_hint": "code_analysis",
    },
    {
        "index": 1,
        "title": "代码生成",
        "description": "创建一个 Python 工具函数，实现安全的 JSON 文件读取（含错误处理和编码检测）",
        "difficulty": "中等",
        "expected_path": "complex",
        "xp_reward": 30,
        "skill_hint": "backend_dev",
    },
    {
        "index": 2,
        "title": "团队协作",
        "description": "设计一个简单的待办事项 REST API（CRUD），编写 OpenAPI 文档和单元测试",
        "difficulty": "高级",
        "expected_path": "complex",
        "xp_reward": 50,
        "skill_hint": "api_design",
    },
]


def get_onboarding_tasks():
    return ONBOARDING_TASKS
