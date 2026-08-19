"""
Playwright 浏览器自动化 — Python 端实现

对齐 TS 端 orchestrator/src/toolkit/browser.ts 的 25 个工具。
"""

import asyncio
import base64
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("playwright_browser")

# 延迟导入 playwright（仅在实际使用时加载）
_playwright = None
_browser = None
_context = None
_pages: Dict[str, Any] = {}
_active_page_id: str = ""
_initialized = False

SCREENSHOT_DIR = os.environ.get("PLAYWRIGHT_SCREENSHOT_DIR", "/tmp/screenshots")


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
