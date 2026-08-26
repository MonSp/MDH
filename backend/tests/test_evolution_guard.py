"""Tests for evolution_guard.py — CI 进化健康度门禁"""
import os
import subprocess
import sys
import pytest


@pytest.fixture
def guard_env(tmp_path):
    """创建模拟的进化数据环境"""
    data_dir = tmp_path / "backend" / "data"
    exp_dir = data_dir / "experience" / "rules"
    exp_dir.mkdir(parents=True)

    import yaml
    # 创建健康规则
    for i in range(5):
        rule = {
            "rules": [{
                "rule_id": f"rule-{i}",
                "trigger_condition": f"x{i}",
                "action": f"y{i}",
                "rule_type": "success_pattern",
                "keywords": ["backend"],
                "status": "approved",
                "effectiveness_score": 0.8,
                "usage_count": 10,
                "success_count": 8,
            }]
        }
        (exp_dir / f"rule-{i}.yaml").write_text(yaml.dump(rule), encoding="utf-8")

    return str(data_dir)


class TestEvolutionGuard:
    def test_guard_script_exists(self):
        """脚本文件存在"""
        script = os.path.join(os.path.dirname(__file__), "..", "scripts", "evolution_guard.py")
        assert os.path.isfile(script)

    def test_guard_runs_without_error(self, guard_env, monkeypatch):
        """脚本可以运行（不检查退出码，只检查不崩溃）"""
        script = os.path.join(os.path.dirname(__file__), "..", "scripts", "evolution_guard.py")
        monkeypatch.setenv("PYTHONPATH", os.path.join(os.path.dirname(__file__), ".."))
        result = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.join(os.path.dirname(__file__), ".."),
        )
        # 不崩溃即可（退出码可能是 0 或 1）
        assert result.returncode in (0, 1, 2)
        assert "进化系统健康度" in result.stdout

    def test_guard_reports_domains(self, guard_env):
        """检查反思优先级输出"""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from reflection_priority import ReflectionPriorityQueue
        queue = ReflectionPriorityQueue(guard_env)
        result = queue.compute_priorities()
        # 应该有数据
        assert "summary" in result
