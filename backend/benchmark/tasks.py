"""
评测基准数据集 — 预定义任务 + 预期指标

每条用例包含：
- task: 任务描述
- category: simple | standard | complex
- expected_path: 预期执行路径 (simple | complex | workflow)
- expected_min_files: 最少产出文件数
- expected_tools: 预期使用的关键工具
- max_llm_calls: LLM 调用上限
- max_latency_s: 端到端延迟上限（秒）
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class BenchmarkTask:
    """评测任务定义"""
    id: str
    task: str
    category: str  # simple | standard | complex
    expected_path: str  # simple | complex | workflow
    expected_min_files: int = 0
    expected_tools: List[str] = field(default_factory=list)
    max_llm_calls: int = 12
    max_latency_s: float = 60.0
    tags: List[str] = field(default_factory=list)


# ── 评测数据集 ──

BENCHMARK_TASKS: List[BenchmarkTask] = [
    # ── Simple 路径 ──
    BenchmarkTask(
        id="simple-01",
        task="创建一个 Python 函数，计算两个数的最大公约数",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=30,
        tags=["python", "algorithm"],
    ),
    BenchmarkTask(
        id="simple-02",
        task="写一个 README.md 文件，描述一个天气查询 API",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=20,
        tags=["documentation"],
    ),
    BenchmarkTask(
        id="simple-03",
        task="创建一个 JavaScript 函数，验证邮箱格式",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=30,
        tags=["javascript", "validation"],
    ),

    # ── Standard 路径 ──
    BenchmarkTask(
        id="standard-01",
        task="实现一个 Python 命令行工具，支持 JSON 文件的格式化和压缩",
        category="standard",
        expected_path="complex",
        expected_min_files=2,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=8,
        max_latency_s=45,
        tags=["python", "cli"],
    ),
    BenchmarkTask(
        id="standard-02",
        task="创建一个 Express.js REST API，实现用户的 CRUD 操作",
        category="standard",
        expected_path="complex",
        expected_min_files=3,
        expected_tools=["write_file"],
        max_llm_calls=10,
        max_latency_s=60,
        tags=["javascript", "api", "backend"],
    ),

    # ── Complex 路径 ──
    BenchmarkTask(
        id="complex-01",
        task="首先设计一个博客数据库 schema，然后实现后端 API，最后编写测试",
        category="complex",
        expected_path="workflow",
        expected_min_files=4,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=12,
        max_latency_s=90,
        tags=["fullstack", "database", "api", "testing"],
    ),
    BenchmarkTask(
        id="complex-02",
        task="设计并实现一个前端 React 组件库，包含按钮、输入框、模态框，编写 Storybook 文档和单元测试",
        category="complex",
        expected_path="workflow",
        expected_min_files=6,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=12,
        max_latency_s=120,
        tags=["frontend", "react", "components", "testing"],
    ),
]


def get_benchmark_tasks(category: Optional[str] = None, tags: Optional[List[str]] = None) -> List[BenchmarkTask]:
    """获取评测任务（支持按类别和标签过滤）"""
    tasks = BENCHMARK_TASKS
    if category:
        tasks = [t for t in tasks if t.category == category]
    if tags:
        tag_set = set(tags)
        tasks = [t for t in tasks if tag_set.intersection(t.tags)]
    return tasks
