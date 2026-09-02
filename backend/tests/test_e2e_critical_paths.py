"""v1.6.10 关键路径 E2E 测试 — SQLite 后端下 5 条完整链路验证

每条路径测试一个完整的用户可见功能链，不使用 mock。
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def data_dir(tmp_path):
    """创建完整的数据目录"""
    d = tmp_path / "data"
    (d / "agent_profiles").mkdir(parents=True)
    (d / "experience" / "rules").mkdir(parents=True)
    (d / "agent_memory").mkdir(parents=True)
    (d / "reports").mkdir(parents=True)
    (d / "documents").mkdir(parents=True)
    import json as _json
    with open(d / "routing_table.json", "w") as f:
        _json.dump({"departments": [
            {"dept_id": "dept-software", "dept_name": "研发部", "capability_desc": "", "capability_keywords": [],
             "tools": [], "success_rate": 0.5, "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 5},
        ]}, f)
    return str(d)


# ── 路径 1: 会议流程路径 ──


class TestMeetingFlowPath:
    """任务→分流→执行→XP→技能升级"""

    def test_simple_task_grants_xp_and_levels_up(self, data_dir):
        """简单任务授予 XP 并可能触发技能升级"""
        import logging

        from agent_profile_manager import AgentProfileManager
        from meeting_coordinator import MeetingCoordinator

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        profile = mgr.get_or_create("agent-executor", "executor", department="dept-software")

        # 模拟 _grant_task_xp 调用
        mc = object.__new__(MeetingCoordinator)
        mc._agent_profile_manager = mgr
        mc.logger = logging.getLogger("test_mc")

        # 多次调用直到升级
        leveled = False
        for i in range(5):
            result = mc._grant_task_xp(
                "agent-executor", "backend_dev", True, 8.0, 3, department="dept-software"
            )
            if result.get("leveled_up"):
                leveled = True
                break

        profile = mgr.get_profile("agent-executor")
        assert profile.total_xp > 0
        assert profile.skill_progress.get("backend_dev", {}).get("task_count", 0) >= 1
        # 至少应该有一些 XP
        assert profile.skill_progress.get("backend_dev", {}).get("xp", 0) > 0

    def test_triage_classifies_tasks(self, data_dir):
        """分流门正确分类任务"""
        from meeting_coordinator import MeetingCoordinator
        mc = object.__new__(MeetingCoordinator)

        # 简单任务
        result = mc._triage_task("帮我写一个 hello world 函数")
        assert result["level"] == "simple"
        assert result["confidence"] >= 0.8

        # 复杂任务
        result = mc._triage_task("首先设计前端架构，然后实现后端API，最后部署数据库到分布式环境")
        assert result["level"] == "complex"
        assert result["confidence"] < 0.5

    def test_routing_boost_on_skill_upgrade(self, data_dir):
        """技能升级触发路由加成"""
        from agent_profile_manager import AgentProfileManager
        from dynamic_router import DynamicRouter

        routing_path = os.path.join(data_dir, "routing_table.json")
        router = DynamicRouter(routing_path)
        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        router.set_profile_manager(mgr)

        # 初始加成为 0
        assert router._table.get("dept-software", None) is not None
        initial_boost = router._table["dept-software"].skill_level_boost

        # 升级触发加成
        router.update_skill_boost("dept-software")
        assert router._table["dept-software"].skill_level_boost > initial_boost


# ── 路径 2: 进化路径 ──


class TestEvolutionPath:
    """规则创建→有效性追踪→自进化→联动更新"""

    def test_rule_lifecycle_create_to_evolution(self, data_dir):
        """规则从创建到自进化的完整生命周期"""
        from experience_extractor import ExperienceExtractor, ExperienceRule

        ext = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

        # 创建规则
        rule = ExperienceRule(
            rule_id="evo-e2e-1", trigger_condition="task is frontend",
            action="use React hooks", note="", source_task_id="t1",
            source_task_type="frontend", rule_type="success_pattern",
            status="approved", keywords=["react", "frontend"],
            created_at="2026-08-22", effectiveness_score=0.8, usage_count=5, success_count=4,
        )
        ext._save_rule(rule)

        # 检索
        retrieved = ext.retrieve_relevant_rules("frontend", ["react"])
        assert any(r.rule_id == "evo-e2e-1" for r in retrieved)

        # 多次失败触发降级+进化
        for _ in range(15):
            ext.update_rule_effectiveness("evo-e2e-1", False)

        loaded = ext._load_rule("evo-e2e-1")
        assert loaded.status in ("evolved", "pending_review")

        # 进化链追踪
        chain = ext.get_evolution_chain("evo-e2e-1")
        assert len(chain) >= 2

    def test_demotion_log_recorded(self, data_dir):
        """降级事件记录到日志"""
        from experience_extractor import ExperienceExtractor, ExperienceRule

        ext = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
        rule = ExperienceRule(
            rule_id="dem-e2e-1", trigger_condition="x", action="y", note="",
            source_task_id="t1", source_task_type="t", rule_type="success_pattern",
            status="approved", keywords=["a"], created_at="now",
            effectiveness_score=0.8, usage_count=5, success_count=4,
        )
        ext._save_rule(rule)

        # 10 次失败 → score=4/15=0.27 < 0.4 → 降级
        for _ in range(10):
            ext.update_rule_effectiveness("dem-e2e-1", False)

        log = ext.get_demotion_log()
        assert len(log) >= 1
        assert log[0]["rule_id"] == "dem-e2e-1"

    def test_evolution_log_recorded(self, data_dir):
        """进化事件记录到日志"""
        from experience_extractor import ExperienceExtractor, ExperienceRule

        ext = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))
        rule = ExperienceRule(
            rule_id="evo-log-1", trigger_condition="x", action="y", note="",
            source_task_id="t1", source_task_type="t", rule_type="success_pattern",
            status="approved", keywords=["a"], created_at="now",
            effectiveness_score=0.2, usage_count=10, success_count=2,
        )
        ext._save_rule(rule)

        ext.evolve_rule("evo-log-1")
        log = ext.get_evolution_log()
        assert len(log) >= 1
        assert log[0]["original_rule_id"] == "evo-log-1"


# ── 路径 3: 记忆路径 ──


class TestMemoryPath:
    """记忆写入→检索→注入→跨会话学习"""

    def test_memory_full_cycle(self, data_dir):
        """记忆完整生命周期：写入→检索→注入"""
        from agent_memory import AgentMemory

        mem = AgentMemory(data_dir)

        # 写入多条记忆
        mem.add_memory("agent-1", {"type": "task_summary", "content": "完成了用户登录API开发", "keywords": ["登录", "API"], "importance": 0.8})
        mem.add_memory("agent-1", {"type": "learning", "content": "React hooks 比 class components 更简洁", "keywords": ["React", "hooks"], "importance": 0.7})
        mem.add_memory("agent-1", {"type": "observation", "content": "代码审查时注意边界条件", "keywords": ["审查", "边界"], "importance": 0.5})

        # 检索
        results = mem.recall("agent-1", "登录 API", limit=3)
        assert len(results) >= 1
        assert any("登录" in r["content"] for r in results)

        # 注入上下文
        context = mem.inject_context("agent-1", max_chars=500)
        assert "个人记忆" in context
        assert len(context) > 50

    def test_memory_task_recall(self, data_dir):
        """任务前记忆检索"""
        from agent_memory import AgentMemory

        mem = AgentMemory(data_dir)
        mem.add_memory("agent-1", {"type": "task_summary", "content": "完成了React组件开发", "keywords": ["React", "组件"], "importance": 0.8})

        context = mem.recall_for_task("agent-1", "开发新的React组件")
        assert "此前相关经验" in context
        assert "React" in context

    def test_memory_aging(self, data_dir):
        """记忆老化"""
        from datetime import datetime, timedelta, timezone

        from agent_memory import AgentMemory

        mem = AgentMemory(data_dir)
        mem.add_memory("agent-1", {"type": "observation", "content": "旧记忆", "importance": 0.8})

        # 模拟老化
        mem._db.execute("UPDATE agent_memories SET last_referenced_at = ? WHERE agent_id = ?",
                        ((datetime.now(timezone.utc) - timedelta(days=60)).isoformat(), "agent-1"))
        mem._db.commit()

        aged = mem.age_memories("agent-1", aging_days=30)
        assert aged == 1
        assert mem.get_memory("agent-1")["entries"][0]["importance"] < 0.8


# ── 路径 4: 交付路径 ──


class TestDeliveryPath:
    """任务完成→报告→通知"""

    def test_delivery_full_cycle(self, data_dir):
        """交付完整流程"""
        import subprocess

        from delivery_engine import DeliveryEngine

        ws = os.path.join(data_dir, "workspace")
        os.makedirs(ws)
        subprocess.run(["git", "init"], cwd=ws, capture_output=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=ws, capture_output=True)
        subprocess.run(["git", "config", "user.name", "test"], cwd=ws, capture_output=True)

        # 创建文件
        with open(os.path.join(ws, "main.py"), "w") as f:
            f.write("def hello(): print('hello')")

        engine = DeliveryEngine(data_dir, ws)
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="实现 hello 函数",
            execution_results=[{"result": "完成", "written_files": ["main.py"]}],
            review_result={"structured_feedback": {"status": "approved", "score": 8.5}},
            delivery_types=["git", "notification", "report"],
        )

        # Git 交付
        assert result["git"]["success"] is True

        # 通知交付
        assert result["notification"]["success"] is True
        assert result["notification"]["notification"]["agent_id"] == "agent-1"

        # 报告交付
        assert result["report"]["success"] is True
        assert os.path.isfile(result["report"]["report_path"])

    def test_delivery_log(self, data_dir):
        """交付日志记录"""
        from delivery_engine import DeliveryEngine

        engine = DeliveryEngine(data_dir)
        engine.deliver(agent_id="a1", task_id="t1", task_description="test",
                       execution_results=[], review_result={}, delivery_types=["notification"])

        stats = engine.get_delivery_stats()
        assert stats["total_deliveries"] == 1


# ── 路径 5: 监控路径 ──


class TestMonitoringPath:
    """健康检查→告警→反思优先级"""

    def test_health_check_with_profiles(self, data_dir):
        """健康检查检测到 agent 档案"""
        from agent_profile_manager import AgentProfileManager
        from ops import OpsManager

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        mgr.get_or_create("agent-1", "Agent-1", department="dept-software")

        ops = OpsManager(data_dir)
        result = ops.health_check()
        assert result["healthy"] is True
        assert result["checks"]["database"]["healthy"] is True

    def test_proactive_monitor_detects_weak_agents(self, data_dir):
        """主动监控检测弱表现 agent"""
        from agent_profile_manager import AgentProfileManager
        from proactive_monitor import ProactiveMonitor

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        p = mgr.get_or_create("weak-agent", "弱表现", department="dept-software")
        p.skill_progress = {"backend_dev": {"level": 1, "xp": 50, "usage_count": 5, "success_count": 1, "avg_review_score": 4.0, "task_count": 5}}
        mgr.save_profile(p)

        monitor = ProactiveMonitor(data_dir)
        result = monitor.run_health_check()
        low_rate = [a for a in result["alerts"] if a["type"] == "low_success_rate"]
        assert len(low_rate) >= 1

    def test_reflection_priority_with_rules(self, data_dir):
        """反思优先级队列生成"""
        import yaml

        from reflection_priority import ReflectionPriorityQueue

        rules_dir = os.path.join(data_dir, "experience", "rules")
        for i, score in enumerate([0.9, 0.8, 0.2, 0.1]):
            rule = {"rules": [{"rule_id": f"rp-{i}", "trigger_condition": f"x{i}", "action": "y",
                               "rule_type": "success_pattern", "keywords": ["test"],
                               "status": "approved", "effectiveness_score": score,
                               "usage_count": 10, "success_count": int(score * 10)}]}
            with open(os.path.join(rules_dir, f"rp-{i}.yaml"), "w") as f:
                yaml.dump(rule, f)

        queue = ReflectionPriorityQueue(data_dir)
        result = queue.compute_priorities()
        assert result["summary"]["total_domains"] > 0
        assert len(result["queue"]) > 0
