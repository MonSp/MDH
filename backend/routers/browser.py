"""
Browser Automation REST API Router — task queue, pool, and results.
"""

import logging
import uuid

from fastapi import APIRouter, Request
from rate_limiter import limiter, RATE_LIMITS

from routers.common import fail

logger = logging.getLogger("routers.browser")

router = APIRouter(prefix="/api/browser", tags=["browser"])

_task_queue = None
_browser_pool = None
_browser_initialized = False


def init(task_queue, browser_pool):
    global _task_queue, _browser_pool
    _task_queue = task_queue
    _browser_pool = browser_pool


async def _ensure_browser():
    global _browser_initialized
    if not _browser_initialized:
        await _browser_pool.initialize()
        _browser_initialized = True


@router.post("/submit")
@limiter.limit(RATE_LIMITS["write"])
async def browser_submit_task(request: Request):
    try:
        await _ensure_browser()
        body = await request.json()
        from playwright_browser import BrowserTask
        task_id = body.get("id", str(uuid.uuid4())[:8])
        task = BrowserTask(
            id=task_id,
            url=body.get("url", ""),
            actions=body.get("actions", []),
            priority=body.get("priority", 0),
            timeout=body.get("timeout", 60.0),
        )
        await _task_queue.submit(task)
        return {"success": True, "task_id": task_id}
    except Exception as e:
        logger.warning("browser_submit_task 失败: %s", e)
        return fail(str(e))


@router.get("/status")
async def browser_status():
    return {
        "success": True,
        "queue": {
            "pending": _task_queue.pending_count,
            "completed": _task_queue.result_count,
        },
        "pool": _browser_pool.get_stats(),
    }


@router.get("/result/{task_id}")
async def browser_get_result(task_id: str):
    result = _task_queue.get_result(task_id)
    if not result:
        return fail(f"任务不存在或未完成: {task_id}")
    return {
        "success": True,
        "data": {
            "task_id": result.task_id,
            "success": result.success,
            "data": result.data,
            "error": result.error,
            "screenshots": result.screenshots,
        },
    }


@router.get("/results")
async def browser_get_all_results():
    results = _task_queue.get_all_results()
    return {
        "success": True,
        "data": {
            task_id: {
                "task_id": r.task_id,
                "success": r.success,
                "data": r.data,
                "error": r.error,
                "screenshots_count": len(r.screenshots),
            }
            for task_id, r in results.items()
        },
    }


@router.post("/start")
async def browser_start_queue():
    try:
        await _ensure_browser()
        await _task_queue.start()
        return {"success": True, "message": "任务队列已启动"}
    except Exception as e:
        logger.warning("browser_start_queue 失败: %s", e)
        return fail(str(e))


@router.post("/stop")
async def browser_stop_queue():
    try:
        await _task_queue.stop()
        return {"success": True, "message": "任务队列已停止"}
    except Exception as e:
        logger.warning("browser_stop_queue 失败: %s", e)
        return fail(str(e))


@router.post("/pool/health-check")
async def browser_pool_health_check():
    try:
        await _browser_pool.health_check()
        return {"success": True, "stats": _browser_pool.get_stats()}
    except Exception as e:
        logger.warning("browser_pool_health_check 失败: %s", e)
        return fail(str(e))
