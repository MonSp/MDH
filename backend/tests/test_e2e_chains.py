"""端到端集成验证 — 证明模块之间真正连通

四条链路：
1. 进化链路：规则创建→注入→任务执行→effectiveness→自进化→联动更新
2. 协作链路：mentor匹配→经验注入→任务完成→XP→技能升级→路由加成
3. 交付链路：任务完成→记忆写入→Git交付→通知→报告
4. 监控链路：健康巡检→告警→反思优先级→改进提案
"""

import json
import os
import subprocess
import pytest
import tempfile

sys_path = os.path.join(os.path.dirname(__file__), "..")
import sys
sys.path.insert(0, sys_path)


@pytest.fixture
def data_dir(tmp_path):
    """创建完整的数据目录结构"""
    d = tmp_path / "data"
    (d / "agent_profiles").mkdir(parents=True)
    (d / "experience" / "rules").mkdir(parents=True)
    (d / "agent_memory").mkdir(parents=True)
    (d / "documents").mkdir(parents=True)
    (d / "reports").mkdir(parents=True)
    # 路由表
    with open(d / "routing_table.json", "w") as f:
        json.dump({"departments": [
            {"dept_id": "dept-software", "dept_name": "研发部", "capability_desc": "", "capability_keywords": [],
             "tools": [], "success_rate": 0.5, "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 5},
        ]}, f)
    return str(d)


@pytest.fixture
def workspace(tmp_path):
    """创建工作区"""
    ws = tmp_path / "workspace"
    ws.mkdir()
    subprocess.run(["git", "init"], cwd=str(ws), capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=str(ws), capture_output=True)
    subprocess.run(["git", "config", "user.name", "test"], cwd=str(ws), capture_output=True)
    return str(ws)


class TestEvolutionChain:
    """进化链路：规则→注入→执行→有效性→自进化→联动"""

    def test_rule_lifecycle(self, data_dir):
        """规则从创建到自进化的完整生命周期"""
        import yaml
        from experience_extractor import ExperienceExtractor

        extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

        # 1. 创建规则
        from experience_extractor import ExperienceRule
        rule = ExperienceRule(
            rule_id="evo-test-1", trigger_condition="task is frontend",
            action="use React hooks", note="", source_task_id="t1",
            source_task_type="frontend", rule_type="success_pattern",
            status="approved", keywords=["react", "frontend"],
            created_at="2026-08-20", effectiveness_score=0.8, usage_count=5, success_count=4,
        )
        extractor._save_rule(rule)
        assert extractor._load_rule("evo-test-1") is not None

        # 2. 注入检索
        retrieved = extractor.retrieve_relevant_rules("frontend", ["react"])
        assert any(r.rule_id == "evo-test-1" for r in retrieved)

        # 3. 更新有效性
        extractor.update_rule_effectiveness("evo-test-1", True)
        loaded = extractor._load_rule("evo-test-1")
        assert loaded.usage_count == 6
        assert loaded.success_count == 5

        # 4. 模拟多次失败触发自进化（需 effectiveness < 0.3 且 usage >= 5）
        for _ in range(15):
            extractor.update_rule_effectiveness("evo-test-1", False)
        loaded = extractor._load_rule("evo-test-1")
        # 应该已经进化或降级（5 success / 20 total = 0.25 < 0.3）
        assert loaded.status in ("evolved", "pending_review")

    def test_evolution_chain_linkage(self, data_dir):
        """进化链追踪"""
        from experience_extractor import ExperienceExtractor, ExperienceRule

        extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

        # 创建低分规则
        rule = ExperienceRule(
            rule_id="chain-1", trigger_condition="x", action="y", note="",
            source_task_id="t1", source_task_type="t", rule_type="success_pattern",
            status="approved", keywords=["a"], created_at="now",
            effectiveness_score=0.2, usage_count=10, success_count=2,
        )
        extractor._save_rule(rule)

        # 触发进化
        evolved = extractor.evolve_rule("chain-1")
        assert evolved is not None
        assert evolved.parent_rule_id == "chain-1"
        assert evolved.evolution_count == 1

        # 检查进化链（原始 → 进化后）
        chain = extractor.get_evolution_chain("chain-1")
        assert len(chain) >= 2
        # 第一条是原始规则
        assert chain[0]["rule_id"] == "chain-1"
        # 最后一条是进化后的规则
        assert chain[-1]["parent_rule_id"] == "chain-1"


class TestCollaborationChain:
    """协作链路：mentor→注入→XP→升级→路由加成"""

    def test_mentor_xp_flow(self, data_dir):
        """mentor 匹配→XP 奖励完整流程"""
        from agent_profile_manager import AgentProfileManager

        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))

        # 创建 mentor（高级）和 mentee（初级）
        mentor = mgr.get_or_create("mentor-1", "高级开发", department="dept-software")
        mentor.career_stage = "senior"
        mentor.skill_progress = {"backend_dev": {"level": 3, "xp": 600, "usage_count": 20, "success_count": 18, "avg_review_score": 8.5, "task_count": 20}}
        mentor.total_xp = 600
        mgr.save_profile(mentor)

        mentee = mgr.get_or_create("mentee-1", "初级开发", department="dept-software")

        # mentor 匹配
        found = mgr.find_mentor("mentee-1")
        assert found is not None
        assert found.agent_id == "mentor-1"

        # mentee 获得 XP
        result = mgr.grant_xp("mentee-1", "backend_dev", True, 8.0, 3, {"xp_thresholds": [50, 150, 350]})
        assert result["xp_gained"] > 0

        # 检查 mentee 技能增长
        mentee_profile = mgr.get_profile("mentee-1")
        assert mentee_profile.skill_progress.get("backend_dev", {}).get("xp", 0) > 0

    def test_skill_level_routing_integration(self, data_dir):
        """技能等级→路由加成完整流程"""
        from dynamic_router import DynamicRouter
        from agent_profile_manager import AgentProfileManager
        import json

        # 初始化路由表
        routing_path = os.path.join(data_dir, "routing_table.json")
        router = DynamicRouter(routing_path)
        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        router.set_profile_manager(mgr)

        # 创建高级 agent
        profile = mgr.get_or_create("agent-1", "高级开发", department="dept-software")
        profile.skill_progress = {"backend_dev": {"level": 2, "xp": 300, "usage_count": 10, "success_count": 8}}
        mgr.save_profile(profile)

        # 路由评分应包含技能等级加成
        score = router._compute_skill_level_score("dept-software", "后端开发")
        assert score > 0

        # 升级后路由加成增加
        router.update_skill_boost("dept-software")
        assert router._table["dept-software"].skill_level_boost > 0


class TestDeliveryChain:
    """交付链路：任务完成→记忆→Git交付→通知→报告"""

    def test_memory_and_delivery_flow(self, data_dir, workspace):
        """记忆写入→交付完整流程"""
        from agent_memory import AgentMemory
        from delivery_engine import DeliveryEngine

        # 1. 任务完成 → 写入记忆
        memory = AgentMemory(data_dir)
        memory.add_memory("agent-1", {
            "type": "task_summary",
            "content": "完成了用户登录 API 开发",
            "keywords": ["登录", "API"],
            "importance": 0.8,
        })

        # 2. 检索记忆
        results = memory.recall("agent-1", "登录 API")
        assert len(results) == 1

        # 3. 交付
        engine = DeliveryEngine(data_dir, workspace)
        with open(os.path.join(workspace, "login.py"), "w") as f:
            f.write("def login(): pass")
        result = engine.deliver(
            agent_id="agent-1", task_id="task-1", task_description="实现登录API",
            execution_results=[{"result": "完成", "written_files": ["login.py"]}],
            review_result={"structured_feedback": {"status": "approved", "score": 8.5}},
            delivery_types=["git", "notification", "report"],
        )

        # Git 交付
        assert result["git"]["success"] is True
        assert result["git"]["action"] == "committed"

        # 通知交付
        assert result["notification"]["success"] is True

        # 报告交付
        assert result["report"]["success"] is True
        assert os.path.isfile(result["report"]["report_path"])


class TestMonitorChain:
    """监控链路：健康巡检→告警→反思优先级→改进提案"""

    def test_health_to_alerts_flow(self, data_dir):
        """健康巡检→告警完整流程"""
        from agent_profile_manager import AgentProfileManager
        from proactive_monitor import ProactiveMonitor

        # 创建弱表现 agent
        mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
        profile = mgr.get_or_create("weak-agent", "弱表现", department="dept-software")
        profile.skill_progress = {"backend_dev": {"level": 1, "xp": 50, "usage_count": 5, "success_count": 1, "avg_review_score": 4.0, "task_count": 5}}
        mgr.save_profile(profile)

        # 运行健康巡检
        monitor = ProactiveMonitor(data_dir)
        result = monitor.run_health_check()

        # 应该检测到低成功率
        low_rate = [a for a in result["alerts"] if a["type"] == "low_success_rate"]
        assert len(low_rate) >= 1

        # 告警持久化
        assert len(monitor.get_recent_alerts()) > 0

    def test_reflection_priority_flow(self, data_dir):
        """反思优先级队列"""
        import yaml
        from reflection_priority import ReflectionPriorityQueue

        # 创建不同质量的规则
        rules_dir = os.path.join(data_dir, "experience", "rules")
        for i, score in enumerate([0.9, 0.8, 0.2, 0.1]):
            rule = {
                "rules": [{
                    "rule_id": f"rule-{i}", "trigger_condition": f"x{i}", "action": f"y{i}",
                    "rule_type": "success_pattern", "keywords": ["test"],
                    "status": "approved", "effectiveness_score": score,
                    "usage_count": 10, "success_count": int(score * 10),
                }]
            }
            with open(os.path.join(rules_dir, f"rule-{i}.yaml"), "w") as f:
                yaml.dump(rule, f)

        queue = ReflectionPriorityQueue(data_dir)
        result = queue.compute_priorities()

        # 应该有 critical 和 healthy 领域
        assert result["summary"]["total_domains"] > 0
        assert len(result["queue"]) > 0

    def test_introspection_flow(self, data_dir):
        """系统自省"""
        import yaml
        from system_introspection import SystemIntrospection

        # 创建规则
        rules_dir = os.path.join(data_dir, "experience", "rules")
        for i in range(3):
            rule = {"rules": [{"rule_id": f"r{i}", "trigger_condition": f"x{i}", "action": "y",
                               "rule_type": "success_pattern", "keywords": ["test"],
                               "status": "approved", "effectiveness_score": 0.8,
                               "usage_count": 10, "success_count": 8}]}
            with open(os.path.join(rules_dir, f"r{i}.yaml"), "w") as f:
                yaml.dump(rule, f)

        si = SystemIntrospection(data_dir)
        health = si.get_module_health()
        assert health["total_rules"] == 3

        proposals = si.generate_improvement_proposals()
        assert isinstance(proposals, list)
