"""
Playwright 浏览器自动化 — Python 端实现

对齐 TS 端 orchestrator/src/toolkit/browser.ts 的 25 个工具。
支持任务队列和批量执行。
"""

import asyncio
import base64
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("playwright_browser")

# 延迟导入 playwright（仅在实际使用时加载）
_playwright = None
_browser = None
_context = None
_pages: Dict[str, Any] = {}
_active_page_id: str = ""
_initialized = False

SCREENSHOT_DIR = os.environ.get("PLAYWRIGHT_SCREENSHOT_DIR", "/tmp/screenshots")


@dataclass
class BrowserTask:
    """浏览器任务"""
    id: str
    url: str
    actions: List[Dict[str, Any]] = field(default_factory=list)
    priority: int = 0
    timeout: float = 60.0


@dataclass
class TaskResult:
    """任务结果"""
    task_id: str
    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    screenshots: List[str] = field(default_factory=list)


class BrowserTaskQueue:
    """浏览器任务队列 — 支持批量执行和并发控制"""

    def __init__(self, max_concurrent: int = 3):
        self._queue: asyncio.Queue[BrowserTask] = asyncio.Queue()
        self._results: Dict[str, TaskResult] = {}
        self._max_concurrent = max_concurrent
        self._running = False
        self._workers: List[asyncio.Task] = []

    async def submit(self, task: BrowserTask) -> str:
        """提交任务到队列"""
        await self._queue.put(task)
        return task.id

    async def start(self):
        """启动工作线程"""
        self._running = True
        for i in range(self._max_concurrent):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self._workers.append(worker)

    async def stop(self):
        """停止工作线程"""
        self._running = False
        for worker in self._workers:
            worker.cancel()
        self._workers.clear()

    async def _worker(self, name: str):
        """工作线程：从队列取任务执行"""
        while self._running:
            try:
                task = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                logger.info("[%s] 执行任务: %s (%s)", name, task.id, task.url)
                result = await self._execute_task(task)
                self._results[task.id] = result
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("[%s] 工作线程异常: %s", name, e)

    async def _execute_task(self, task: BrowserTask) -> TaskResult:
        """执行单个任务"""
        screenshots = []
        try:
            result = await navigate(task.url)
            for action in task.actions:
                action_type = action.get("action", "")
                if action_type == "click":
                    await click(action["selector"])
                elif action_type == "fill":
                    await fill(action["selector"], action["value"])
                elif action_type == "wait":
                    await asyncio.sleep(int(action.get("value", "1000")) / 1000)
                elif action_type == "screenshot":
                    ss = await screenshot()
                    screenshots.append(ss.get("path", ""))

            # 最终截图
            final_ss = await screenshot()
            screenshots.append(final_ss.get("path", ""))

            return TaskResult(
                task_id=task.id,
                success=True,
                data={"url": _get_active_page().url if _initialized else ""},
                screenshots=screenshots,
            )
        except Exception as e:
            return TaskResult(task_id=task.id, success=False, error=str(e), screenshots=screenshots)

    def get_result(self, task_id: str) -> Optional[TaskResult]:
        """获取任务结果"""
        return self._results.get(task_id)

    def get_all_results(self) -> Dict[str, TaskResult]:
        """获取所有结果"""
        return dict(self._results)

    @property
    def pending_count(self) -> int:
        return self._queue.qsize()

    @property
    def result_count(self) -> int:
        return len(self._results)


# ── 浏览器操作 ──

async def _ensure_initialized():
    """确保浏览器已初始化"""
    global _playwright, _browser, _context, _pages, _active_page_id, _initialized
    if _initialized:
        return

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright 未安装，请运行: pip install playwright && playwright install chromium")

    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch(headless=True)
    _context = await _browser.new_context(viewport={"width": 1280, "height": 720})
    _context.set_default_timeout(30000)

    page = await _context.new_page()
    tab_id = "tab-1"
    _pages[tab_id] = page
    _active_page_id = tab_id

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    _initialized = True
    logger.info("Playwright 浏览器已初始化")


async def _close():
    """关闭浏览器"""
    global _playwright, _browser, _context, _pages, _active_page_id, _initialized
    if _browser:
        await _browser.close()
    if _playwright:
        await _playwright.stop()
    _browser = None
    _context = None
    _pages.clear()
    _active_page_id = ""
    _initialized = False


def _get_active_page():
    """获取当前活跃页面"""
    page = _pages.get(_active_page_id)
    if not page:
        raise RuntimeError("No active page")
    return page


# ── 导航工具 ──

async def navigate(url: str) -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    await page.goto(url, wait_until="domcontentloaded")
    return {"url": page.url, "title": await page.title()}


async def go_back() -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    await page.go_back()
    return {"url": page.url, "title": await page.title()}


async def go_forward() -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    await page.go_forward()
    return {"url": page.url, "title": await page.title()}


async def reload() -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    await page.reload()
    return {"url": page.url, "title": await page.title()}


# ── 交互工具 ──

async def click(selector: str) -> dict:
    await _ensure_initialized()
    await _get_active_page().click(selector)
    return {"success": True}


async def fill(selector: str, value: str) -> dict:
    await _ensure_initialized()
    await _get_active_page().fill(selector, value)
    return {"success": True}


async def type_text(selector: str, text: str, delay: int = 50) -> dict:
    await _ensure_initialized()
    await _get_active_page().type(selector, text, delay=delay)
    return {"success": True}


async def press_key(key: str) -> dict:
    await _ensure_initialized()
    await _get_active_page().keyboard.press(key)
    return {"success": True}


async def hover(selector: str) -> dict:
    await _ensure_initialized()
    await _get_active_page().hover(selector)
    return {"success": True}


async def select(selector: str, value: str) -> dict:
    await _ensure_initialized()
    await _get_active_page().select_option(selector, value)
    return {"success": True}


async def scroll(direction: str, amount: int = 500) -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    delta = -amount if direction in ("up", "left") else amount
    x = delta if direction in ("left", "right") else 0
    y = delta if direction in ("up", "down") else 0
    await page.mouse.wheel(x, y)
    return {"success": True}


# ── 查询工具 ──

async def get_text(selector: str) -> dict:
    await _ensure_initialized()
    text = await _get_active_page().text_content(selector)
    return {"text": (text or "").strip()}


async def get_attribute(selector: str, attribute: str) -> dict:
    await _ensure_initialized()
    value = await _get_active_page().get_attribute(selector, attribute)
    return {"value": value}


async def get_url() -> dict:
    await _ensure_initialized()
    return {"url": _get_active_page().url}


async def get_title() -> dict:
    await _ensure_initialized()
    return {"title": await _get_active_page().title()}


async def query(selector: str) -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    element = await page.query_selector(selector)
    if not element:
        return {"exists": False}
    text = await element.text_content()
    tag = await element.evaluate("el => el.tagName.toLowerCase()")
    visible = await element.is_visible()
    return {"exists": True, "text": (text or "").strip(), "tag": tag, "visible": visible}


async def wait_for(selector: str, state: str = "visible") -> dict:
    await _ensure_initialized()
    await _get_active_page().wait_for_selector(selector, state=state)
    return {"success": True}


# ── 截图工具 ──

async def screenshot(path: Optional[str] = None) -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    screenshot_path = path or os.path.join(SCREENSHOT_DIR, f"screenshot-{int(asyncio.get_event_loop().time() * 1000)}.png")
    await page.screenshot(path=screenshot_path, full_page=True)
    buffer = await page.screenshot(full_page=True)
    return {"path": screenshot_path, "base64": base64.b64encode(buffer).decode()}


async def screenshot_element(selector: str, path: Optional[str] = None) -> dict:
    await _ensure_initialized()
    page = _get_active_page()
    element = await page.query_selector(selector)
    if not element:
        raise ValueError(f"Element not found: {selector}")
    screenshot_path = path or os.path.join(SCREENSHOT_DIR, f"element-{int(asyncio.get_event_loop().time() * 1000)}.png")
    await element.screenshot(path=screenshot_path)
    buffer = await element.screenshot()
    return {"path": screenshot_path, "base64": base64.b64encode(buffer).decode()}


# ── 标签页工具 ──

async def list_tabs() -> dict:
    await _ensure_initialized()
    tabs = []
    for tab_id, page in _pages.items():
        tabs.append({
            "id": tab_id,
            "url": page.url,
            "title": await page.title(),
            "active": tab_id == _active_page_id,
        })
    return {"tabs": tabs}


async def switch_tab(tab_id: str) -> dict:
    global _active_page_id
    await _ensure_initialized()
    if tab_id not in _pages:
        raise ValueError(f"Tab not found: {tab_id}")
    _active_page_id = tab_id
    return {"success": True}


async def new_tab(url: Optional[str] = None) -> dict:
    global _active_page_id
    await _ensure_initialized()
    page = await _context.new_page()
    tab_id = f"tab-{len(_pages) + 1}"
    _pages[tab_id] = page
    _active_page_id = tab_id
    if url:
        await page.goto(url, wait_until="domcontentloaded")
    return {"tabId": tab_id, "url": page.url}


async def close_tab(tab_id: str) -> dict:
    global _active_page_id
    await _ensure_initialized()
    page = _pages.get(tab_id)
    if not page:
        raise ValueError(f"Tab not found: {tab_id}")
    await page.close()
    del _pages[tab_id]
    if _active_page_id == tab_id:
        remaining = list(_pages.keys())
        _active_page_id = remaining[0] if remaining else ""
    return {"success": True}


# ── 高级工具 ──

async def evaluate_js(code: str) -> dict:
    await _ensure_initialized()
    result = await _get_active_page().evaluate(code)
    return {"result": result}


async def execute_steps(steps: List[Dict[str, Any]]) -> List[dict]:
    await _ensure_initialized()
    results = []
    for step in steps:
        action = step.get("action", "")
        try:
            if action == "navigate":
                r = await navigate(step["value"])
            elif action == "click":
                r = await click(step["selector"])
            elif action == "fill":
                r = await fill(step["selector"], step["value"])
            elif action == "type":
                r = await type_text(step["selector"], step["value"])
            elif action == "press":
                r = await press_key(step["key"])
            elif action == "hover":
                r = await hover(step["selector"])
            elif action == "wait":
                await asyncio.sleep(int(step.get("value", "1000")) / 1000)
                r = {"success": True}
            else:
                raise ValueError(f"Unknown step action: {action}")
            results.append({"action": action, "success": True, "result": r})
        except Exception as e:
            results.append({"action": action, "success": False, "result": {"error": str(e)}})
    return results


# ── 浏览器实例池 ──

@dataclass
class BrowserInstance:
    """浏览器实例"""
    id: str
    browser: Any = None
    context: Any = None
    pages: Dict[str, Any] = field(default_factory=dict)
    active_page_id: str = ""
    healthy: bool = True
    created_at: float = 0.0
    last_used: float = 0.0
    task_count: int = 0


class BrowserPool:
    """浏览器实例池 — 多实例管理、健康检查、负载均衡"""

    def __init__(self, min_instances: int = 1, max_instances: int = 5, idle_timeout: float = 300.0):
        self._min_instances = min_instances
        self._max_instances = max_instances
        self._idle_timeout = idle_timeout
        self._instances: Dict[str, BrowserInstance] = {}
        self._lock = asyncio.Lock()
        self._playwright = None
        self._initialized = False

    async def initialize(self):
        """初始化实例池"""
        if self._initialized:
            return

        try:
            from playwright.async_api import async_playwright
        except ImportError:
            raise RuntimeError("playwright 未安装")

        self._playwright = await async_playwright().start()

        # 创建最小实例数
        for i in range(self._min_instances):
            await self._create_instance(f"pool-{i}")

        self._initialized = True
        logger.info("浏览器实例池已初始化: %d 实例", self._min_instances)

    async def close(self):
        """关闭所有实例"""
        for instance in self._instances.values():
            if instance.browser:
                await instance.browser.close()
        self._instances.clear()
        if self._playwright:
            await self._playwright.stop()
        self._initialized = False

    async def _create_instance(self, instance_id: str) -> BrowserInstance:
        """创建新实例"""
        browser = await self._playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        context.set_default_timeout(30000)

        page = await context.new_page()
        tab_id = f"{instance_id}-tab-1"
        pages = {tab_id: page}

        instance = BrowserInstance(
            id=instance_id,
            browser=browser,
            context=context,
            pages=pages,
            active_page_id=tab_id,
            created_at=asyncio.get_event_loop().time(),
            last_used=asyncio.get_event_loop().time(),
        )
        self._instances[instance_id] = instance
        logger.info("创建浏览器实例: %s", instance_id)
        return instance

    async def acquire(self) -> BrowserInstance:
        """获取可用实例（负载均衡）"""
        async with self._lock:
            # 找到最空闲的健康实例
            available = [i for i in self._instances.values() if i.healthy]
            if not available:
                # 没有健康实例，创建新的
                if len(self._instances) < self._max_instances:
                    instance_id = f"pool-{len(self._instances)}"
                    return await self._create_instance(instance_id)
                else:
                    raise RuntimeError("没有可用的浏览器实例")

            # 选择任务数最少的实例
            instance = min(available, key=lambda i: i.task_count)
            instance.last_used = asyncio.get_event_loop().time()
            instance.task_count += 1
            return instance

    async def release(self, instance_id: str):
        """释放实例"""
        async with self._lock:
            instance = self._instances.get(instance_id)
            if instance:
                instance.task_count = max(0, instance.task_count - 1)

    async def health_check(self):
        """健康检查"""
        for instance_id, instance in list(self._instances.items()):
            try:
                # 尝试创建新页面来测试实例
                page = await instance.context.new_page()
                await page.close()
                instance.healthy = True
            except Exception:
                instance.healthy = False
                logger.warning("浏览器实例不健康: %s", instance_id)

    async def cleanup_idle(self):
        """清理空闲实例"""
        now = asyncio.get_event_loop().time()
        async with self._lock:
            for instance_id, instance in list(self._instances.items()):
                if (len(self._instances) > self._min_instances and
                    instance.task_count == 0 and
                    now - instance.last_used > self._idle_timeout):
                    # 关闭空闲实例
                    if instance.browser:
                        await instance.browser.close()
                    del self._instances[instance_id]
                    logger.info("清理空闲浏览器实例: %s", instance_id)

    def get_stats(self) -> Dict[str, Any]:
        """获取池统计"""
        return {
            "total": len(self._instances),
            "healthy": sum(1 for i in self._instances.values() if i.healthy),
            "busy": sum(1 for i in self._instances.values() if i.task_count > 0),
            "idle": sum(1 for i in self._instances.values() if i.task_count == 0),
        }
