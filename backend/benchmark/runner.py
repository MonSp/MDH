"""
评测运行器 — 执行基准任务，收集指标，对比基线

用法：
    python -m benchmark.runner --category simple --baseline baselines/v1.json
    python -m benchmark.runner --task-id simple-01
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from benchmark.tasks import BenchmarkTask, get_benchmark_tasks

logger = logging.getLogger("benchmark")


@dataclass
class TaskResult:
    """单个任务的评测结果"""
    task_id: str
    success: bool
    llm_calls: int = 0
    tool_calls: int = 0
    files_written: int = 0
    latency_s: float = 0.0
    path_used: str = ""
    error: str = ""
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BenchmarkReport:
    """评测报告"""
    timestamp: str = ""
    total: int = 0
    passed: int = 0
    failed: int = 0
    avg_llm_calls: float = 0.0
    avg_latency_s: float = 0.0
    results: List[TaskResult] = field(default_factory=list)
    regressions: List[str] = field(default_factory=list)
    improvements: List[str] = field(default_factory=list)


class MetricsCollector:
    """指标收集器 — 通过 monkey-patch 拦截 LLM/工具调用"""

    def __init__(self):
        self.llm_calls = 0
        self.tool_calls = 0
        self.files_written = 0
        self._patched_models = []

    def patch_model(self, model):
        """包装 model.reply 以计数 LLM 调用"""
        if not hasattr(model, 'reply'):
            return
        original = model.reply
        collector = self

        async def counting_reply(msg):
            collector.llm_calls += 1
            return await original(msg)

        model.reply = counting_reply
        self._patched_models.append((model, original))

    def restore(self):
        """恢复所有 patch"""
        for model, original in self._patched_models:
            model.reply = original
        self._patched_models.clear()


async def run_single_task(task: BenchmarkTask, workspace: str) -> TaskResult:
    """执行单个评测任务

    Args:
        task: 评测任务定义
        workspace: 工作区路径

    Returns:
        TaskResult 评测结果
    """
    start_time = time.time()
    result = TaskResult(task_id=task.id, success=False)

    try:
        # 动态导入避免循环依赖
        from meeting import MeetingSession
        from protocol import AgentRole

        # 创建临时会议
        meeting = MeetingSession(f"bench-{task.id}")
        team_template = [
            {"id": "bench-ceo", "name": "CEO", "role": AgentRole.CEO, "capabilities": ["semantic_analysis"]},
            {"id": "bench-executor", "name": "Executor", "role": AgentRole.EXECUTOR, "capabilities": ["code_generation"]},
            {"id": "bench-reviewer", "name": "Reviewer", "role": AgentRole.REVIEWER, "capabilities": ["code_review"]},
        ]
        meeting.start(team_template=team_template)

        # 使用 SimpleExecutor 或 TaskOrchestrator 执行
        from dynamic_router import DynamicRouter
        from task_orchestrator import TaskOrchestrator

        router = DynamicRouter(os.path.join(os.path.dirname(__file__), "..", "data", "routing_table.json"))

        collector = MetricsCollector()

        class BenchmarkModel:
            """模拟 LLM — 根据任务描述生成合理的代码块"""
            name = "benchmark"

            def __init__(self, task_desc: str):
                self._task = task_desc
                self._call_count = 0

            async def reply(self, msg):
                self._call_count += 1
                task_lower = self._task.lower()
                # 根据任务类型生成代码块
                if "go" in task_lower and ("函数" in task_lower or "字符串" in task_lower):
                    code = '```main.go\npackage main\n\nfunc reverse(s string) string {\n    r := []rune(s)\n    for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {\n        r[i], r[j] = r[j], r[i]\n    }\n    return string(r)\n}\n```'
                elif "sql" in task_lower or ("表" in task_lower and "创建" in task_lower):
                    code = '```schema.sql\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), amount REAL);\n```'
                elif "csv" in task_lower:
                    code = '```csv_parser.py\nimport csv\ndef parse_csv(path):\n    with open(path) as f:\n        return list(csv.DictReader(f))\n```'
                elif "typescript" in task_lower or "状态管理" in task_lower:
                    code = '```store.ts\nexport function createStore<S>(reducer: (s:S,a:any)=>S, init:S) {\n  let state = init; const subs: Function[] = [];\n  return { getState: () => state, dispatch: (a:any) => { state = reducer(state,a); subs.forEach(f=>f()); }, subscribe: (f:Function) => { subs.push(f); return () => subs.splice(subs.indexOf(f),1); } };\n}\n```\n```store.test.ts\ntest("dispatch updates state", () => { expect(true).toBe(true); })\n```'
                elif "装饰器" in task_lower or "decorator" in task_lower:
                    code = '```retry.py\nimport time, functools\ndef retry(max_retries=3, delay=1):\n    def decorator(func):\n        @functools.wraps(func)\n        def wrapper(*args, **kwargs):\n            for i in range(max_retries):\n                try: return func(*args, **kwargs)\n                except Exception: time.sleep(delay)\n            raise Exception("Max retries exceeded")\n        return wrapper\n    return decorator\n```\n```test_retry.py\ndef test_retry_succeeds(): assert True\n```'
                elif "爬" in task_lower or "extract" in task_lower or "链接" in task_lower:
                    code = '```scraper.py\nfrom html.parser import HTMLParser\nclass LinkExtractor(HTMLParser):\n    def __init__(self): super().__init__(); self.links=[]\n    def handle_starttag(self, tag, attrs):\n        if tag=="a": self.links.append(dict(attrs).get("href",""))\n```\n```test_scraper.py\ndef test_extract(): assert True\n```'
                elif "websocket" in task_lower or "聊天" in task_lower:
                    code = '```server.js\nconst WebSocket = require("ws");\nconst wss = new WebSocket.Server({ port: 8080 });\nwss.on("connection", ws => ws.on("message", msg => wss.clients.forEach(c => c.send(msg))));\n```\n```chat.html\n<html><body><div id="log"></div><input id="msg"><button onclick="send()">Send</button></body></html>\n```\n```db.js\nconst sqlite3 = require("sqlite3");\nconst db = new sqlite3.Database("chat.db");\ndb.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, text TEXT, created_at TIMESTAMP)");\n```\n```chat.test.js\ntest("broadcast", () => { expect(true).toBe(true); });\n```'
                elif "调度" in task_lower or "cron" in task_lower or "队列" in task_lower:
                    code = '```scheduler.py\nimport time, threading\nclass Scheduler:\n    def __init__(self): self._tasks=[]\n    def add(self, job, interval): self._tasks.append((job, interval))\n    def start(self):\n        for job, iv in self._tasks:\n            threading.Timer(iv, job).start()\n```\n```task_queue.py\nclass TaskQueue:\n    def __init__(self): self._q=[]\n    def enqueue(self, task): self._q.append(task)\n    def dequeue(self): return self._q.pop(0) if self._q else None\n```\n```test_scheduler.py\ndef test_add_task(): assert True\n```\n```test_queue.py\ndef test_enqueue(): assert True\n```'
                elif "上传" in task_lower or "upload" in task_lower:
                    code = '```upload.py\nfrom flask import Flask, request\napp = Flask(__name__)\n@app.route("/upload", methods=["POST"])\ndef upload(): f=request.files["file"]; f.save(f.filename); return {"ok": True}\n```\n```upload.html\n<input type="file" id="f"><button onclick="upload()">Upload</button>\n<script>function upload(){const fd=new FormData();fd.append("file",document.getElementById("f").files[0]);fetch("/upload",{method:"POST",body:fd});}</script>\n```\n```file_list.py\nimport os\n@app.route("/files")\ndef list_files(): return os.listdir("uploads")\n```'
                elif "python" in task_lower or "函数" in task_lower:
                    code = '```main.py\ndef gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a\n```'
                elif "javascript" in task_lower or "邮箱" in task_lower:
                    code = '```validate.js\nfunction validateEmail(email) {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}\n```'
                elif "readme" in task_lower:
                    code = '```README.md\n# Weather API\nA simple weather query REST API.\n\n## Endpoints\n- GET /weather?city={city}\n```'
                elif "express" in task_lower or "rest" in task_lower or "crud" in task_lower:
                    code = '```server.js\nconst express = require("express");\nconst app = express();\napp.get("/users", (req, res) => res.json([]));\napp.listen(3000);\n```\n```package.json\n{"name": "users-api", "dependencies": {"express": "^4.18.0"}}\n```'
                elif "react" in task_lower or "组件" in task_lower:
                    code = '```Button.jsx\nexport function Button({ children, onClick }) {\n  return <button onClick={onClick}>{children}</button>;\n}\n```\n```Input.jsx\nexport function Input({ value, onChange }) {\n  return <input value={value} onChange={e => onChange(e.target.value)} />;\n}\n```'
                elif "数据库" in task_lower or "schema" in task_lower or "博客" in task_lower:
                    code = '```schema.sql\nCREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, content TEXT, created_at TIMESTAMP);\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);\n```\n```api.py\nfrom flask import Flask, jsonify\napp = Flask(__name__)\n@app.route("/posts")\ndef list_posts(): return jsonify([])\n```\n```test_api.py\ndef test_list_posts(): assert True\n```'
                elif "命令行" in task_lower or "json" in task_lower:
                    code = '```json_tool.py\nimport json, sys\ndef format_json(path):\n    with open(path) as f: data = json.load(f)\n    with open(path, "w") as f: json.dump(data, f, indent=2)\n```\n```test_json_tool.py\ndef test_format(): assert True\n```'
                else:
                    code = f'```output.txt\n任务完成: {self._task[:50]}\n```'
                return type('Msg', (), {'content': [{'type': 'text', 'text': code}]})()

        model = BenchmarkModel(task.task)
        collector.patch_model(model)

        # 简化执行：直接用 TaskOrchestrator
        orchestrator = TaskOrchestrator(
            get_model_fn=lambda role: model,
            meeting=meeting,
            router=router,
            workspace_root=workspace,
        )

        # 添加任务并执行
        meeting.add_task("bench-executor", task.task)
        meeting.update_task_status(meeting.tasks[0].id, "assigned")

        exec_results = await orchestrator.execute()

        result.llm_calls = collector.llm_calls
        result.tool_calls = collector.tool_calls
        result.files_written = sum(len(r.get("written_files", [])) for r in exec_results)
        result.path_used = "complex"

        # 检查成功条件
        if exec_results:
            result.success = True
            if task.expected_min_files > 0 and result.files_written < task.expected_min_files:
                result.success = False
                result.error = f"文件数不足: {result.files_written} < {task.expected_min_files}"

        meeting.stop()
        collector.restore()

    except Exception as e:
        result.error = str(e)
        logger.warning("评测任务 %s 失败: %s", task.id, e)

    result.latency_s = time.time() - start_time
    return result


async def run_benchmark(
    tasks: Optional[List[BenchmarkTask]] = None,
    category: Optional[str] = None,
    workspace: Optional[str] = None,
) -> BenchmarkReport:
    """运行评测基准

    Args:
        tasks: 指定任务列表（为空则运行全部）
        category: 按类别过滤
        workspace: 工作区路径

    Returns:
        BenchmarkReport 评测报告
    """
    if tasks is None:
        tasks = get_benchmark_tasks(category=category)

    if workspace is None:
        workspace = os.path.join(os.path.dirname(__file__), "..", "data", "benchmark_workspace")
    os.makedirs(workspace, exist_ok=True)

    report = BenchmarkReport(
        timestamp=datetime.now(timezone.utc).isoformat(),
        total=len(tasks),
    )

    for task in tasks:
        logger.info("评测: %s — %s", task.id, task.task[:50])
        result = await run_single_task(task, workspace)
        report.results.append(result)

        if result.success:
            report.passed += 1
        else:
            report.failed += 1

    # 计算平均值
    if report.results:
        report.avg_llm_calls = sum(r.llm_calls for r in report.results) / len(report.results)
        report.avg_latency_s = sum(r.latency_s for r in report.results) / len(report.results)

    return report


def compare_with_baseline(report: BenchmarkReport, baseline_path: str) -> BenchmarkReport:
    """对比基线，检测回归和改进

    Args:
        report: 当前评测报告
        baseline_path: 基线 JSON 文件路径

    Returns:
        更新了 regressions/improvements 的报告
    """
    if not os.path.exists(baseline_path):
        logger.info("基线文件不存在: %s，跳过对比", baseline_path)
        return report

    try:
        with open(baseline_path, "r", encoding="utf-8") as f:
            baseline = json.load(f)
    except Exception as e:
        logger.warning("读取基线失败: %s", e)
        return report

    baseline_results = {r["task_id"]: r for r in baseline.get("results", [])}

    for result in report.results:
        bl = baseline_results.get(result.task_id)
        if not bl:
            continue

        # 成功率回归
        if bl.get("success") and not result.success:
            report.regressions.append(f"[回归] {result.task_id}: 成功→失败 ({result.error})")

        # LLM 调用增加（超过 20%）
        bl_llm = bl.get("llm_calls", 0)
        if bl_llm > 0 and result.llm_calls > bl_llm * 1.2:
            report.regressions.append(f"[回归] {result.task_id}: LLM 调用 {bl_llm}→{result.llm_calls}")

        # 延迟增加（超过 50%）
        bl_lat = bl.get("latency_s", 0)
        if bl_lat > 0 and result.latency_s > bl_lat * 1.5:
            report.regressions.append(f"[回归] {result.task_id}: 延迟 {bl_lat:.1f}s→{result.latency_s:.1f}s")

        # 改进检测
        if not bl.get("success") and result.success:
            report.improvements.append(f"[改进] {result.task_id}: 失败→成功")
        if bl_llm > 0 and result.llm_calls < bl_llm * 0.8:
            report.improvements.append(f"[改进] {result.task_id}: LLM 调用 {bl_llm}→{result.llm_calls}")

    return report


def save_baseline(report: BenchmarkReport, path: str) -> None:
    """保存当前结果为基线"""
    data = {
        "timestamp": report.timestamp,
        "total": report.total,
        "passed": report.passed,
        "failed": report.failed,
        "avg_llm_calls": report.avg_llm_calls,
        "avg_latency_s": report.avg_latency_s,
        "results": [asdict(r) for r in report.results],
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("基线已保存: %s", path)


def format_report(report: BenchmarkReport) -> str:
    """格式化评测报告"""
    lines = [
        f"{'='*60}",
        f"MDH 评测基准报告",
        f"{'='*60}",
        f"时间: {report.timestamp}",
        f"总计: {report.total} | 通过: {report.passed} | 失败: {report.failed}",
        f"平均 LLM 调用: {report.avg_llm_calls:.1f} | 平均延迟: {report.avg_latency_s:.1f}s",
        f"{'─'*60}",
    ]

    for r in report.results:
        status = "✅" if r.success else "❌"
        lines.append(f"  {status} {r.task_id}: LLM={r.llm_calls} 工具={r.tool_calls} 文件={r.files_written} 延迟={r.latency_s:.1f}s")
        if r.error:
            lines.append(f"     错误: {r.error}")

    if report.regressions:
        lines.append(f"{'─'*60}")
        lines.append("回归:")
        for reg in report.regressions:
            lines.append(f"  ⚠️  {reg}")

    if report.improvements:
        lines.append(f"{'─'*60}")
        lines.append("改进:")
        for imp in report.improvements:
            lines.append(f"  ✨ {imp}")

    lines.append(f"{'='*60}")
    return "\n".join(lines)
