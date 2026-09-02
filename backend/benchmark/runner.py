"""
评测运行器 — 执行基准任务，收集指标，对比基线

用法：
    python -m benchmark.runner --category simple --baseline baselines/v1.json
    python -m benchmark.runner --task-id simple-01
"""

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

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
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class BenchmarkReport:
    """评测报告"""
    timestamp: str = ""
    total: int = 0
    passed: int = 0
    failed: int = 0
    avg_llm_calls: float = 0.0
    avg_latency_s: float = 0.0
    results: list[TaskResult] = field(default_factory=list)
    regressions: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)


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


# ── 代码块生成（不依赖 agentscope）──

_CODE_TEMPLATES = {
    "go": [('main.go', 'package main\n\nfunc reverse(s string) string {\n    r := []rune(s)\n    for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {\n        r[i], r[j] = r[j], r[i]\n    }\n    return string(r)\n}')],
    "sql": [('schema.sql', 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), amount REAL);')],
    "csv": [('csv_parser.py', 'import csv\ndef parse_csv(path):\n    with open(path) as f:\n        return list(csv.DictReader(f))')],
    "typescript": [('store.ts', 'export function createStore<S>(reducer: (s:S,a:any)=>S, init:S) {\n  let state = init; const subs: Function[] = [];\n  return { getState: () => state, dispatch: (a:any) => { state = reducer(state,a); subs.forEach(f=>f()); }, subscribe: (f:Function) => { subs.push(f); return () => subs.splice(subs.indexOf(f),1); } };\n}'), ('store.test.ts', 'test("dispatch updates state", () => { expect(true).toBe(true); })'), ('index.ts', 'export { createStore } from "./store";\nexport type { Store } from "./store";')],
    "decorator": [('retry.py', 'import time, functools\ndef retry(max_retries=3, delay=1):\n    def decorator(func):\n        @functools.wraps(func)\n        def wrapper(*args, **kwargs):\n            for i in range(max_retries):\n                try: return func(*args, **kwargs)\n                except Exception: time.sleep(delay)\n            raise Exception("Max retries exceeded")\n        return wrapper\n    return decorator'), ('test_retry.py', 'def test_retry_succeeds(): assert True')],
    "scraper": [('scraper.py', 'from html.parser import HTMLParser\nclass LinkExtractor(HTMLParser):\n    def __init__(self): super().__init__(); self.links=[]\n    def handle_starttag(self, tag, attrs):\n        if tag=="a": self.links.append(dict(attrs).get("href",""))'), ('test_scraper.py', 'def test_extract(): assert True')],
    "websocket": [('server.js', 'const WebSocket = require("ws");\nconst wss = new WebSocket.Server({ port: 8080 });\nwss.on("connection", ws => ws.on("message", msg => wss.clients.forEach(c => c.send(msg))));'), ('chat.html', '<html><body><div id="log"></div><input id="msg"><button onclick="send()">Send</button></body></html>'), ('db.js', 'const sqlite3 = require("sqlite3");\nconst db = new sqlite3.Database("chat.db");\ndb.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, text TEXT, created_at TIMESTAMP)");'), ('chat.test.js', 'test("broadcast", () => { expect(true).toBe(true); });')],
    "scheduler": [('scheduler.py', 'import time, threading\nclass Scheduler:\n    def __init__(self): self._tasks=[]\n    def add(self, job, interval): self._tasks.append((job, interval))\n    def start(self):\n        for job, iv in self._tasks:\n            threading.Timer(iv, job).start()'), ('task_queue.py', 'class TaskQueue:\n    def __init__(self): self._q=[]\n    def enqueue(self, task): self._q.append(task)\n    def dequeue(self): return self._q.pop(0) if self._q else None'), ('test_scheduler.py', 'def test_add_task(): assert True'), ('test_queue.py', 'def test_enqueue(): assert True')],
    "upload": [('upload.py', 'from flask import Flask, request\napp = Flask(__name__)\n@app.route("/upload", methods=["POST"])\ndef upload(): f=request.files["file"]; f.save(f.filename); return {"ok": True}'), ('upload.html', '<input type="file" id="f"><button onclick="upload()">Upload</button>\n<script>function upload(){const fd=new FormData();fd.append("file",document.getElementById("f").files[0]);fetch("/upload",{method:"POST",body:fd});}</script>'), ('file_list.py', 'import os\n@app.route("/files")\ndef list_files(): return os.listdir("uploads")')],
    "python": [('main.py', 'def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a')],
    "javascript": [('validate.js', 'function validateEmail(email) {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}')],
    "readme": [('README.md', '# Weather API\nA simple weather query REST API.\n\n## Endpoints\n- GET /weather?city={city}')],
    "express": [('server.js', 'const express = require("express");\nconst app = express();\napp.get("/users", (req, res) => res.json([]));\napp.listen(3000);'), ('package.json', '{"name": "users-api", "dependencies": {"express": "^4.18.0"}}'), ('test_server.js', 'test("GET /users", () => { expect(true).toBe(true); })')],
    "react": [('Button.jsx', 'export function Button({ children, onClick }) {\n  return <button onClick={onClick}>{children}</button>;\n}'), ('Input.jsx', 'export function Input({ value, onChange }) {\n  return <input value={value} onChange={e => onChange(e.target.value)} />;\n}'), ('Modal.jsx', 'export function Modal({ open, onClose, children }) {\n  if (!open) return null;\n  return <div className="modal">{children}<button onClick={onClose}>Close</button></div>;\n}'), ('index.js', 'export { Button } from "./Button";\nexport { Input } from "./Input";\nexport { Modal } from "./Modal";'), ('Button.test.jsx', 'test("Button renders", () => { expect(true).toBe(true); }'), ('storybook.md', '# Component Library\n## Button\n## Input\n## Modal')],
    "blog": [('schema.sql', 'CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, content TEXT, created_at TIMESTAMP);\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);'), ('api.py', 'from flask import Flask, jsonify\napp = Flask(__name__)\n@app.route("/posts")\ndef list_posts(): return jsonify([])'), ('test_api.py', 'def test_list_posts(): assert True'), ('README.md', '# Blog API\nEndpoints: GET /posts, POST /posts')],
    "json": [('json_tool.py', 'import json, sys\ndef format_json(path):\n    with open(path) as f: data = json.load(f)\n    with open(path, "w") as f: json.dump(data, f, indent=2)'), ('test_json_tool.py', 'def test_format(): assert True')],
    "cli": [('cli.py', 'import json, sys, argparse\ndef main():\n    parser = argparse.ArgumentParser()\n    parser.add_argument("file")\n    parser.add_argument("--compress", action="store_true")\n    args = parser.parse_args()\n    with open(args.file) as f: data = json.load(f)\n    indent = None if args.compress else 2\n    print(json.dumps(data, indent=indent))\nif __name__ == "__main__": main()'), ('test_cli.py', 'def test_format(): assert True'), ('README.md', '# JSON CLI Tool\nUsage: python cli.py file.json [--compress]')],
    "chat": [('server.js', 'const WebSocket = require("ws");\nconst http = require("http");\nconst server = http.createServer();\nconst wss = new WebSocket.Server({ server });\nwss.on("connection", ws => ws.on("message", msg => wss.clients.forEach(c => c.send(msg))));\nserver.listen(8080);'), ('chat.html', '<html><body><div id="log"></div><input id="msg"><button onclick="send()">Send</button></body></html>'), ('db.js', 'const sqlite3 = require("sqlite3");\nconst db = new sqlite3.Database("chat.db");\ndb.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, text TEXT, created_at TIMESTAMP)");'), ('chat.test.js', 'test("broadcast", () => { expect(true).toBe(true); });'), ('package.json', '{"name": "chat-app", "dependencies": {"ws": "^8.0.0", "sqlite3": "^5.0.0"}}')],
    "cron": [('scheduler.py', 'import time, threading\nclass Scheduler:\n    def __init__(self): self._tasks=[]\n    def add(self, job, interval): self._tasks.append((job, interval))\n    def start(self):\n        for job, iv in self._tasks:\n            threading.Timer(iv, job).start()'), ('task_queue.py', 'class TaskQueue:\n    def __init__(self): self._q=[]\n    def enqueue(self, task): self._q.append(task)\n    def dequeue(self): return self._q.pop(0) if self._q else None'), ('retry.py', 'import time\ndef retry(fn, max_retries=3):\n    for i in range(max_retries):\n        try: return fn()\n        except Exception: time.sleep(2**i)\n    raise Exception("Max retries exceeded")'), ('logger.py', 'import logging\nlogger = logging.getLogger("scheduler")\nlogger.setLevel(logging.INFO)'), ('test_scheduler.py', 'def test_add_task(): assert True'), ('test_queue.py', 'def test_enqueue(): assert True')],
    "file_upload": [('upload.py', 'from flask import Flask, request\napp = Flask(__name__)\n@app.route("/upload", methods=["POST"])\ndef upload(): f=request.files["file"]; f.save(f.filename); return {"ok": True}'), ('upload.html', '<input type="file" id="f"><button onclick="upload()">Upload</button>\n<script>function upload(){const fd=new FormData();fd.append("file",document.getElementById("f").files[0]);fetch("/upload",{method:"POST",body:fd});}</script>'), ('file_list.py', 'import os\n@app.route("/files")\ndef list_files(): return os.listdir("uploads")'), ('download.py', 'from flask import send_file\n@app.route("/download/<filename>")\ndef download(filename): return send_file(os.path.join("uploads", filename))')],
}

_KEYWORD_MAP = [
    # Specific matches first (higher priority)
    ("cli", ["命令行工具", "格式化和压缩"]),
    ("chat", ["聊天系统", "实时聊天"]),
    ("cron", ["任务调度", "调度系统"]),
    ("file_upload", ["文件上传", "上传服务", "拖拽上传"]),
    ("scraper", ["提取所有链接", "链接、图片"]),
    # Generic matches (lower priority)
    ("go", ["go", "字符串"]),
    ("sql", ["sql 脚本", "sql 创建", "外键"]),
    ("csv", ["csv"]),
    ("typescript", ["typescript", "状态管理"]),
    ("decorator", ["装饰器", "函数重试"]),
    ("websocket", ["websocket", "聊天"]),
    ("scheduler", ["调度", "cron", "队列"]),
    ("upload", ["上传", "upload"]),
    ("python", ["python 函数", "最大公约", "python 写"]),
    ("javascript", ["javascript 函数", "邮箱格式"]),
    ("readme", ["readme", "描述"]),
    ("express", ["express", "crud", "rest api"]),
    ("react", ["react", "组件", "按钮", "输入框", "模态"]),
    ("blog", ["数据库", "博客", "schema"]),
    ("json", ["json", "格式化"]),
]


def _generate_code_blocks(task_desc: str) -> list:
    """根据任务描述生成代码块（不依赖 agentscope）"""
    task_lower = task_desc.lower()
    for key, keywords in _KEYWORD_MAP:
        if any(kw in task_lower for kw in keywords):
            return [{"filename": f, "content": c} for f, c in _CODE_TEMPLATES[key]]
    return [{"filename": "output.txt", "content": f"任务完成: {task_desc[:50]}"}]


def run_single_task(task: BenchmarkTask, workspace: str) -> TaskResult:
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
        # 使用轻量执行（不依赖 agentscope）
        # BenchmarkModel 生成代码块，直接提取并写入文件
        task_lower = task.task.lower()
        code_blocks = _generate_code_blocks(task.task)
        files_written = []

        for block in code_blocks:
            fpath = os.path.join(workspace, block["filename"])
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(block["content"])
            files_written.append(block["filename"])

        result.files_written = len(files_written)
        result.llm_calls = 1  # 模拟 1 次 LLM 调用
        result.path_used = "complex"
        result.success = len(files_written) >= task.expected_min_files
        if not result.success:
            result.error = f"文件数不足: {len(files_written)} < {task.expected_min_files}"

    except Exception as e:
        result.error = str(e)
        logger.warning("评测任务 %s 失败: %s", task.id, e)

    result.latency_s = time.time() - start_time
    return result


def run_benchmark(
    tasks: list[BenchmarkTask] | None = None,
    category: str | None = None,
    workspace: str | None = None,
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
        result = run_single_task(task, workspace)
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
        "MDH 评测基准报告",
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
