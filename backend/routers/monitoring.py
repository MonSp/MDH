"""
Monitoring REST API Router — LLM costs, dashboard, benchmark, knowledge network,
reflection, federation, capability, introspection, delivery, health, router table, gates.
"""

import json
import logging
import os
from dataclasses import asdict

from fastapi import APIRouter, Body, Request

from rate_limiter import RATE_LIMITS, limiter
from routers.common import fail, ok

logger = logging.getLogger("routers.monitoring")

router = APIRouter(tags=["monitoring"])

_srv = None
_data_dir = None


def init(server_module, data_dir: str):
    global _srv, _data_dir
    _srv = server_module
    _data_dir = data_dir


# ── LLM Costs ──

@router.get("/api/llm/costs")
@limiter.limit(RATE_LIMITS["read"])
async def get_llm_costs(request: Request):
    try:
        from llm_cost_tracker import get_tracker
        return ok(get_tracker(_data_dir).get_summary())
    except Exception as e:
        logger.exception("get_llm_costs 失败")
        return fail(str(e))


@router.get("/api/llm/costs/records")
async def get_llm_cost_records(limit: int = 100):
    try:
        from llm_cost_tracker import get_tracker
        return ok({"records": get_tracker(_data_dir).get_records(limit)})
    except Exception as e:
        logger.exception("get_llm_cost_records 失败")
        return fail(str(e))


# ── Dashboard ──

@router.get("/api/dashboard/performance")
@limiter.limit(RATE_LIMITS["read"])
async def get_performance_dashboard(request: Request):
    try:
        from performance_dashboard import PerformanceDashboard
        return ok(PerformanceDashboard(_data_dir).get_overview())
    except Exception as e:
        logger.exception("get_performance_dashboard 失败")
        return fail(str(e))


# ── Benchmark ──

@router.get("/api/benchmark/tasks")
async def list_benchmark_tasks():
    try:
        from benchmark.tasks import get_benchmark_tasks
        tasks = get_benchmark_tasks()
        return ok([{
            "id": t.id, "task": t.task, "category": t.category,
            "expected_path": t.expected_path, "max_llm_calls": t.max_llm_calls,
            "tags": t.tags,
        } for t in tasks])
    except Exception as e:
        logger.warning("list_benchmark_tasks 失败: %s", e)
        return fail(str(e))


@router.post("/api/benchmark/run")
@limiter.limit(RATE_LIMITS["llm"])
async def run_benchmark_endpoint(request: Request, body: dict):
    try:
        from benchmark.runner import run_benchmark
        report = run_benchmark(category=body.get("category"))
        return ok(asdict(report))
    except Exception as e:
        logger.exception("run_benchmark 失败")
        return fail(str(e))


@router.get("/api/benchmark/analyze")
async def analyze_benchmark():
    try:
        from benchmark.analysis import analyze_report, compare_versions
        baseline_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "baselines")
        baselines = sorted([
            os.path.join(baseline_dir, f) for f in os.listdir(baseline_dir)
            if f.endswith(".json")
        ]) if os.path.isdir(baseline_dir) else []
        if not baselines:
            return fail("无基线文件")
        latest = baselines[-1]
        with open(latest, "r", encoding="utf-8") as f:
            data = json.load(f)
        analysis = analyze_report(data)
        analysis.trends = compare_versions(baselines)
        return ok({
            "summary": {
                "total": analysis.total_tasks, "passed": analysis.passed,
                "success_rate": analysis.success_rate,
                "avg_llm_calls": analysis.avg_llm_calls,
                "avg_latency": analysis.avg_latency,
            },
            "by_category": {k: asdict(v) for k, v in analysis.by_category.items()},
            "by_tag": {k: asdict(v) for k, v in analysis.by_tag.items()},
            "anomalies": [asdict(a) for a in analysis.anomalies],
            "trends": [asdict(t) for t in analysis.trends],
        })
    except Exception as e:
        logger.exception("analyze_benchmark 失败")
        return fail(str(e))


# ── Knowledge Network ──

@router.get("/api/knowledge/network-stats")
async def get_knowledge_network_stats():
    try:
        from knowledge_network import KnowledgeNetwork
        network = KnowledgeNetwork(
            data_dir=_data_dir,
            skill_packs_dir=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "skill_packs"),
        )
        return ok(network.get_network_stats())
    except Exception as e:
        logger.exception("get_knowledge_network_stats 失败")
        return fail(str(e))


# ── Reflection ──

@router.get("/api/reflection/priority-queue")
async def get_reflection_priority_queue():
    try:
        from reflection_priority import ReflectionPriorityQueue
        return ok(ReflectionPriorityQueue(_data_dir).compute_priorities())
    except Exception as e:
        logger.exception("get_reflection_priority_queue 失败")
        return fail(str(e))


# ── Federation ──

@router.get("/api/federation/stats")
async def get_federation_stats():
    try:
        from team_federation import TeamFederation
        return ok(TeamFederation(_data_dir).get_federation_stats())
    except Exception as e:
        logger.exception("get_federation_stats 失败")
        return fail(str(e))


@router.get("/api/federation/feed")
async def get_federation_feed(team_id: str = "", keywords: str = ""):
    try:
        from team_federation import TeamFederation
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        return ok(TeamFederation(_data_dir).get_team_feed(team_id, kw_list))
    except Exception as e:
        logger.exception("get_federation_feed 失败")
        return fail(str(e))


# ── Capability ──

@router.get("/api/capability/boundary")
async def get_capability_boundary():
    try:
        from capability_boundary import CapabilityBoundary
        return ok(CapabilityBoundary(_data_dir).get_boundary_report())
    except Exception as e:
        logger.exception("get_capability_boundary 失败")
        return fail(str(e))


@router.get("/api/capability/confidence-map")
async def get_confidence_map():
    try:
        from capability_boundary import CapabilityBoundary
        return ok(CapabilityBoundary(_data_dir).compute_confidence_map())
    except Exception as e:
        logger.exception("get_confidence_map 失败")
        return fail(str(e))


@router.get("/api/capability/detect")
async def detect_unknown_domain(keywords: str = ""):
    try:
        from capability_boundary import CapabilityBoundary
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        return ok(CapabilityBoundary(_data_dir).detect_unknown_domain(kw_list))
    except Exception as e:
        logger.exception("detect_unknown_domain 失败")
        return fail(str(e))


# ── Introspection ──

@router.get("/api/introspection/features")
async def get_feature_utilization():
    try:
        from system_introspection import SystemIntrospection
        return ok(SystemIntrospection(_data_dir).get_feature_utilization())
    except Exception as e:
        logger.exception("get_feature_utilization 失败")
        return fail(str(e))


@router.get("/api/introspection/health")
async def get_module_health():
    try:
        from system_introspection import SystemIntrospection
        return ok(SystemIntrospection(_data_dir).get_module_health())
    except Exception as e:
        logger.exception("get_module_health 失败")
        return fail(str(e))


@router.get("/api/introspection/proposals")
async def get_improvement_proposals():
    try:
        from system_introspection import SystemIntrospection
        return ok({"proposals": SystemIntrospection(_data_dir).generate_improvement_proposals()})
    except Exception as e:
        logger.exception("get_improvement_proposals 失败")
        return fail(str(e))


# ── Delivery ──

@router.post("/api/delivery/deliver")
@limiter.limit(RATE_LIMITS["write"])
async def deliver_task(request: Request):
    try:
        body = await request.json()
        from delivery_engine import DeliveryEngine
        engine = DeliveryEngine(_data_dir)
        result = engine.deliver(
            agent_id=body.get("agent_id", ""),
            task_id=body.get("task_id", ""),
            task_description=body.get("task_description", ""),
            execution_results=body.get("execution_results", []),
            review_result=body.get("review_result", {}),
            delivery_types=body.get("delivery_types", ["git", "notification", "report"]),
        )
        return ok(result)
    except Exception as e:
        logger.exception("deliver_task 失败")
        return fail(str(e))


@router.get("/api/delivery/log")
async def get_delivery_log(limit: int = 20):
    try:
        from delivery_engine import DeliveryEngine
        engine = DeliveryEngine(_data_dir)
        return ok({"log": engine.get_delivery_log(limit), "stats": engine.get_delivery_stats()})
    except Exception as e:
        logger.exception("get_delivery_log 失败")
        return fail(str(e))


# ── Monitor ──

@router.get("/api/monitor/health")
@limiter.limit(RATE_LIMITS["read"])
async def run_health_check(request: Request):
    try:
        from proactive_monitor import ProactiveMonitor
        return ok(ProactiveMonitor(_data_dir).run_health_check())
    except Exception as e:
        logger.exception("run_health_check 失败")
        return fail(str(e))


@router.get("/api/monitor/alerts")
async def get_proactive_alerts(limit: int = 20):
    try:
        from proactive_monitor import ProactiveMonitor
        monitor = ProactiveMonitor(_data_dir)
        return ok({"alerts": monitor.get_recent_alerts(limit), "stats": monitor.get_alert_stats()})
    except Exception as e:
        logger.exception("get_proactive_alerts 失败")
        return fail(str(e))


# ── Router Table ──

@router.get("/api/router/table")
async def get_route_table():
    try:
        return ok(_srv.dynamic_router.get_route_table())
    except (KeyError, ValueError) as e:
        logger.warning("get_route_table 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("get_route_table 失败")
        return fail(str(e))


@router.put("/api/router/table")
async def add_route_entry(body: dict = Body(...)):
    try:
        from dynamic_router import RouteEntry
        entry = RouteEntry(
            dept_id=body["dept_id"],
            dept_name=body["dept_name"],
            capability_desc=body.get("capability_desc", ""),
            capability_keywords=body.get("capability_keywords", []),
            tools=body.get("tools", []),
            success_rate=body.get("success_rate", 0.0),
            total_tasks=body.get("total_tasks", 0),
            successful_tasks=body.get("successful_tasks", 0),
            last_active=body.get("last_active", ""),
            priority=body.get("priority", 0),
        )
        success = _srv.dynamic_router.add_route_entry(entry)
        if not success:
            return fail("保存路由表失败")
        return ok(asdict(entry))
    except KeyError:
        return fail("缺少必填字段: dept_id, dept_name")
    except (KeyError, ValueError) as e:
        logger.warning("add_route_entry 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("add_route_entry 失败")
        return fail(str(e))


@router.delete("/api/router/table/{dept_id}")
async def remove_route_entry(dept_id: str):
    try:
        success = _srv.dynamic_router.remove_route_entry(dept_id)
        if not success:
            return fail(f"部门不存在: {dept_id}")
        return ok({"dept_id": dept_id, "removed": True})
    except (KeyError, ValueError) as e:
        logger.warning("remove_route_entry 失败 预期错误: %s", e)
        return fail(str(e))
    except Exception as e:
        logger.exception("remove_route_entry 失败")
        return fail(str(e))


# ── Gates ──

@router.post("/api/gates")
async def api_gate_create(body: dict):
    approval = await _srv._demo_gate_manager.request_gate(
        requester_id=body.get("requesterId", "agent-demo"),
        operation=body.get("operation", "unknown_operation"),
        description=body.get("description", ""),
        task_id=body.get("taskId", ""),
        gate_id=body.get("gateId", ""),
        approver=body.get("approver", ""),
    )
    return {
        "id": approval.id,
        "taskId": approval.task_id,
        "gateId": approval.gate_id,
        "status": approval.status.value,
    }


@router.get("/api/gates/pending")
async def api_gates_pending():
    from employee_directory import get_directory
    return [
        {
            "id": r["id"],
            "requesterId": r["requesterId"],
            "operation": r["operation"],
            "description": r["description"],
            "status": r["status"],
            "taskId": r.get("taskId", ""),
            "gateId": r.get("gateId", ""),
            "approver": r.get("approver", ""),
            "approverName": get_directory().display_name(r.get("approver", "")),
        }
        for r in _srv._demo_gate_manager.get_pending_requests()
    ]


@router.post("/api/gates/{request_id}/decide")
async def api_gate_decide(request_id: str, body: dict):
    approved = body.get("approved")
    if approved is True:
        return {"resolved": await _srv._demo_gate_manager.handle_gate_response(
            request_id, True, reason=body.get("reason", ""),
        )}
    await _srv._demo_gate_manager.handle_gate_response(
        request_id, False, reason=body.get("reason", ""),
    )
    return {"resolved": False}
