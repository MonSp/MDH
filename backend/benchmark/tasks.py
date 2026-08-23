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
    BenchmarkTask(
        id="simple-04",
        task="用 Python 写一个函数，将 CSV 文件解析为字典列表",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=25,
        tags=["python", "data"],
    ),
    BenchmarkTask(
        id="simple-05",
        task="创建一个 Go 函数，实现字符串反转",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=25,
        tags=["go", "algorithm"],
    ),
    BenchmarkTask(
        id="simple-06",
        task="写一个 SQL 脚本，创建用户表和订单表，含外键约束",
        category="simple",
        expected_path="simple",
        expected_min_files=1,
        expected_tools=["write_file"],
        max_llm_calls=3,
        max_latency_s=20,
        tags=["sql", "database"],
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
    BenchmarkTask(
        id="standard-03",
        task="实现一个 Python 装饰器，支持函数重试、超时和日志记录，编写单元测试",
        category="standard",
        expected_path="complex",
        expected_min_files=2,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=8,
        max_latency_s=40,
        tags=["python", "decorator", "testing"],
    ),
    BenchmarkTask(
        id="standard-04",
        task="用 TypeScript 实现一个简单的状态管理库，支持 subscribe/dispatch/getState，编写测试",
        category="standard",
        expected_path="complex",
        expected_min_files=3,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=10,
        max_latency_s=50,
        tags=["typescript", "library", "testing"],
    ),
    BenchmarkTask(
        id="standard-05",
        task="编写一个 Python 脚本，从 HTML 页面提取所有链接、图片和标题，输出为 JSON",
        category="standard",
        expected_path="complex",
        expected_min_files=2,
        expected_tools=["write_file"],
        max_llm_calls=8,
        max_latency_s=40,
        tags=["python", "scraping", "data"],
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
    BenchmarkTask(
        id="complex-03",
        task="实现一个实时聊天系统：后端 WebSocket 服务 + 前端聊天界面 + 消息持久化到数据库",
        category="complex",
        expected_path="workflow",
        expected_min_files=5,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=12,
        max_latency_s=120,
        tags=["fullstack", "websocket", "realtime", "database"],
    ),
    BenchmarkTask(
        id="complex-04",
        task="设计并实现一个任务调度系统：支持 cron 表达式、任务队列、失败重试、执行日志，编写集成测试",
        category="complex",
        expected_path="workflow",
        expected_min_files=5,
        expected_tools=["write_file", "run_tests"],
        max_llm_calls=12,
        max_latency_s=100,
        tags=["backend", "scheduling", "queue", "testing"],
    ),
    BenchmarkTask(
        id="complex-05",
        task="实现一个文件上传服务：前端拖拽上传 + 后端接收存储 + 文件列表展示 + 下载链接生成",
        category="complex",
        expected_path="workflow",
        expected_min_files=4,
        expected_tools=["write_file"],
        max_llm_calls=12,
        max_latency_s=100,
        tags=["fullstack", "upload", "storage", "frontend"],
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
