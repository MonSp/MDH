"""Tests for AgentMemory — Agent 持久记忆"""
import pytest
from agent_memory import AgentMemory


@pytest.fixture
def memory(tmp_path):
    return AgentMemory(str(tmp_path))


class TestAgentMemory:
    def test_add_and_get_memory(self, memory):
        """添加和获取记忆"""
        memory.add_memory("agent-1", {"type": "learning", "content": "使用 React hooks 管理状态", "importance": 0.8})
        mem = memory.get_memory("agent-1")
        assert len(mem["entries"]) == 1
        assert mem["entries"][0]["content"] == "使用 React hooks 管理状态"

    def test_recall_by_keyword(self, memory):
        """按关键词检索记忆"""
        memory.add_memory("agent-1", {"type": "learning", "content": "React hooks 很好用", "keywords": ["react", "hooks"]})
        memory.add_memory("agent-1", {"type": "learning", "content": "Python 装饰器很强大", "keywords": ["python", "decorator"]})
        results = memory.recall("agent-1", "react")
        assert len(results) == 1
        assert "React" in results[0]["content"]

    def test_recall_by_content(self, memory):
        """按内容匹配检索"""
        memory.add_memory("agent-1", {"type": "task_summary", "content": "完成了登录 API 的开发"})
        results = memory.recall("agent-1", "登录")
        assert len(results) == 1

    def test_recall_empty(self, memory):
        """无记忆返回空"""
        assert memory.recall("agent-1", "test") == []

    def test_inject_context(self, memory):
        """注入上下文"""
        memory.add_memory("agent-1", {"type": "learning", "content": "经验1", "importance": 0.9})
        memory.add_memory("agent-1", {"type": "task_summary", "content": "经验2", "importance": 0.7})
        context = memory.inject_context("agent-1")
        assert "个人记忆" in context
        assert "经验1" in context

    def test_inject_context_empty(self, memory):
        """无记忆返回空"""
        assert memory.inject_context("agent-1") == ""

    def test_aging(self, memory):
        """记忆老化"""
        memory.add_memory("agent-1", {"type": "observation", "content": "旧记忆", "importance": 0.8})
        # 直接修改 last_referenced_at 模拟老化
        mem = memory.get_memory("agent-1")
        mem["entries"][0]["last_referenced_at"] = "2020-01-01T00:00:00Z"
        memory._save_memory("agent-1", mem)

        aged = memory.age_memories("agent-1", aging_days=30)
        assert aged == 1
        mem2 = memory.get_memory("agent-1")
        assert mem2["entries"][0]["importance"] < 0.8

    def test_summary_generation(self, memory):
        """摘要自动生成"""
        for i in range(3):
            memory.add_memory("agent-1", {"type": "learning", "content": f"学习内容{i}", "importance": 0.5 + i * 0.1})
        mem = memory.get_memory("agent-1")
        assert mem["summary"] != ""

    def test_markdown_generation(self, memory, tmp_path):
        """markdown 文件生成"""
        memory.add_memory("agent-1", {"type": "learning", "content": "测试内容"})
        md_path = tmp_path / "agent_memory" / "agent-1.md"
        assert md_path.exists()
        content = md_path.read_text(encoding="utf-8")
        assert "测试内容" in content

    def test_stats(self, memory):
        """记忆统计"""
        memory.add_memory("agent-1", {"type": "learning", "content": "a"})
        memory.add_memory("agent-2", {"type": "task_summary", "content": "b"})
        stats = memory.get_stats()
        assert stats["total_agents"] == 2
        assert stats["total_entries"] == 2

    def test_persistence(self, memory, tmp_path):
        """持久化"""
        memory.add_memory("agent-1", {"type": "learning", "content": "test"})
        mem2 = AgentMemory(str(tmp_path))
        assert len(mem2.get_memory("agent-1")["entries"]) == 1

    def test_recall_for_task(self, memory):
        """任务前记忆检索"""
        memory.add_memory("agent-1", {"type": "task_summary", "content": "完成用户登录API开发", "keywords": ["用户", "登录", "api"]})
        memory.add_memory("agent-1", {"type": "learning", "content": "React hooks 很好用", "keywords": ["react"]})
        context = memory.recall_for_task("agent-1", "实现用户登录功能")
        assert "用户登录" in context or "此前相关经验" in context

    def test_recall_for_task_empty(self, memory):
        """无匹配记忆返回空"""
        assert memory.recall_for_task("agent-1", "quantum computing xyz") == ""
