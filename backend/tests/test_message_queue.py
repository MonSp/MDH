"""Tests for message_queue.py — async message queue with persistence"""
import asyncio
import os
import tempfile
import pytest
from message_queue import MessageQueue, Message, MessagePriority, MessageStatus


@pytest.fixture
def mq():
    """In-memory message queue"""
    return MessageQueue()


@pytest.fixture
def mq_with_db(tmp_path):
    """Message queue with SQLite persistence"""
    db_path = str(tmp_path / "test.db")
    return MessageQueue(db_path=db_path)


# ── Message dataclass ──

class TestMessage:
    def test_create_default(self):
        msg = Message(topic="test", payload={"key": "value"})
        assert msg.topic == "test"
        assert msg.payload == {"key": "value"}
        assert msg.priority == MessagePriority.NORMAL
        assert msg.status == MessageStatus.PENDING
        assert msg.retry_count == 0
        assert msg.max_retries == 3

    def test_to_dict_roundtrip(self):
        msg = Message(
            topic="events",
            payload={"action": "click"},
            priority=MessagePriority.HIGH,
            status=MessageStatus.PROCESSING,
            retry_count=1,
        )
        d = msg.to_dict()
        assert d["topic"] == "events"
        assert d["priority"] == 2  # HIGH value
        assert d["status"] == "processing"
        assert d["retry_count"] == 1

        restored = Message.from_dict(d)
        assert restored.topic == msg.topic
        assert restored.priority == MessagePriority.HIGH
        assert restored.status == MessageStatus.PROCESSING
        assert restored.retry_count == 1

    def test_priority_ordering(self):
        assert MessagePriority.LOW < MessagePriority.NORMAL
        assert MessagePriority.NORMAL < MessagePriority.HIGH
        assert MessagePriority.HIGH < MessagePriority.URGENT


# ── MessageQueue basic operations ──

class TestMessageQueueBasic:
    @pytest.mark.asyncio
    async def test_publish_and_get_size(self, mq):
        await mq.publish("topic1", {"data": "hello"})
        size = await mq.get_queue_size("topic1")
        assert size == 1

    @pytest.mark.asyncio
    async def test_publish_multiple_topics(self, mq):
        await mq.publish("a", 1)
        await mq.publish("b", 2)
        await mq.publish("a", 3)
        assert await mq.get_queue_size("a") == 2
        assert await mq.get_queue_size("b") == 1

    @pytest.mark.asyncio
    async def test_get_all_queue_sizes(self, mq):
        await mq.publish("a", 1)
        await mq.publish("b", 2)
        await mq.publish("c", 3)
        sizes = await mq.get_all_queue_sizes()
        assert sizes["a"] == 1
        assert sizes["b"] == 1
        assert sizes["c"] == 1

    @pytest.mark.asyncio
    async def test_clear_queue(self, mq):
        await mq.publish("t", 1)
        await mq.publish("t", 2)
        cleared = mq.clear_queue("t")
        assert cleared == 2
        assert await mq.get_queue_size("t") == 0

    @pytest.mark.asyncio
    async def test_clear_empty_queue(self, mq):
        cleared = mq.clear_queue("nonexistent")
        assert cleared == 0

    @pytest.mark.asyncio
    async def test_get_pending_messages_requires_db(self, mq):
        """get_pending_messages returns empty for in-memory queue"""
        await mq.publish("t", "msg1")
        pending = mq.get_pending_messages("t")
        assert pending == []

    @pytest.mark.asyncio
    async def test_get_pending_messages_with_db(self, mq_with_db):
        """get_pending_messages works with SQLite persistence"""
        await mq_with_db.publish("t", "msg1")
        await mq_with_db.publish("t", "msg2")
        pending = mq_with_db.get_pending_messages("t")
        assert len(pending) == 2
        assert all(m.status == MessageStatus.PENDING for m in pending)

    @pytest.mark.asyncio
    async def test_get_pending_all_topics(self, mq_with_db):
        await mq_with_db.publish("a", 1)
        await mq_with_db.publish("b", 2)
        pending = mq_with_db.get_pending_messages()
        assert len(pending) == 2

    @pytest.mark.asyncio
    async def test_empty_queue_size(self, mq):
        assert await mq.get_queue_size("empty") == 0


# ── Persistence ──

class TestPersistence:
    @pytest.mark.asyncio
    async def test_persist_and_reload(self, mq_with_db):
        await mq_with_db.publish("persist", {"key": "value"})
        assert await mq_with_db.get_queue_size("persist") == 1

    @pytest.mark.asyncio
    async def test_reload_from_db(self, tmp_path):
        db_path = str(tmp_path / "reload.db")
        mq1 = MessageQueue(db_path=db_path)
        await mq1.publish("topic", "data")

        # Create new queue with same DB
        mq2 = MessageQueue(db_path=db_path)
        pending = mq2.get_pending_messages("topic")
        assert len(pending) >= 1


# ── Start/Stop ──

class TestLifecycle:
    def test_start_stop(self, mq):
        mq.start()
        assert mq._running is True
        mq.stop()
        assert mq._running is False
