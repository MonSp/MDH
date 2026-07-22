"""
MessageQueue - 异步消息队列模块

提供基于asyncio.Queue的内存消息队列，支持消息持久化和重试机制。
"""
import asyncio
import json
import logging
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

logger = logging.getLogger("message_queue")


class MessagePriority(int, Enum):
    """消息优先级"""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3


class MessageStatus(str, Enum):
    """消息状态"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


@dataclass
class Message:
    """消息数据结构"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    topic: str = ""
    payload: Any = None
    priority: MessagePriority = MessagePriority.NORMAL
    status: MessageStatus = MessageStatus.PENDING
    created_at: float = field(default_factory=time.time)
    processed_at: Optional[float] = None
    retry_count: int = 0
    max_retries: int = 3
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "id": self.id,
            "topic": self.topic,
            "payload": self.payload,
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at,
            "processed_at": self.processed_at,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "error": self.error
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Message':
        """从字典创建"""
        return cls(
            id=data["id"],
            topic=data["topic"],
            payload=data["payload"],
            priority=MessagePriority(data["priority"]),
            status=MessageStatus(data["status"]),
            created_at=data["created_at"],
            processed_at=data.get("processed_at"),
            retry_count=data.get("retry_count", 0),
            max_retries=data.get("max_retries", 3),
            error=data.get("error")
        )


class MessageQueue:
    """
    异步消息队列
    
    基于asyncio.Queue的内存消息队列，支持消息持久化到SQLite。
    """
    
    def __init__(self, db_path: Optional[str] = None, max_retries: int = 3):
        """
        初始化消息队列
        
        Args:
            db_path: SQLite数据库路径，None表示仅内存模式
            max_retries: 默认最大重试次数
        """
        self._queues: Dict[str, asyncio.PriorityQueue] = {}
        self._subscribers: Dict[str, List[Callable]] = {}
        self._db_path = db_path
        self._max_retries = max_retries
        self._processing: Set[str] = set()  # 正在处理的消息ID
        self._running = False
        self._tasks: List[asyncio.Task] = []
        
        if db_path:
            self._init_db()
        
        logger.info("MessageQueue 初始化完成 (db_path=%s)", db_path)
    
    def _init_db(self) -> None:
        """初始化SQLite数据库"""
        try:
            conn = sqlite3.connect(self._db_path)
            cursor = conn.cursor()
            
            # 创建消息表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    topic TEXT NOT NULL,
                    payload TEXT,
                    priority INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'pending',
                    created_at REAL,
                    processed_at REAL,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3,
                    error TEXT
                )
            """)
            
            # 创建索引
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_topic 
                ON messages(topic)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_status 
                ON messages(status)
            """)
            
            conn.commit()
            conn.close()
            
            logger.info("SQLite数据库初始化完成")
        except Exception as e:
            logger.error("SQLite数据库初始化失败: %s", e)
            raise
    
    def _persist_message(self, message: Message) -> None:
        """持久化消息到SQLite"""
        if not self._db_path:
            return
        
        try:
            conn = sqlite3.connect(self._db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT OR REPLACE INTO messages 
                (id, topic, payload, priority, status, created_at, processed_at, 
                 retry_count, max_retries, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                message.id,
                message.topic,
                json.dumps(message.payload) if message.payload else None,
                message.priority.value,
                message.status.value,
                message.created_at,
                message.processed_at,
                message.retry_count,
                message.max_retries,
                message.error
            ))
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("消息持久化失败: %s", e)
    
    def _update_message_status(self, message_id: str, status: MessageStatus, 
                              error: Optional[str] = None) -> None:
        """更新消息状态"""
        if not self._db_path:
            return
        
        try:
            conn = sqlite3.connect(self._db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE messages 
                SET status = ?, processed_at = ?, error = ?
                WHERE id = ?
            """, (status.value, time.time(), error, message_id))
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("更新消息状态失败: %s", e)
    
    async def publish(self, topic: str, payload: Any, 
                     priority: MessagePriority = MessagePriority.NORMAL) -> Message:
        """
        发布消息到队列
        
        Args:
            topic: 消息主题
            payload: 消息内容
            priority: 消息优先级
            
        Returns:
            Message: 创建的消息对象
        """
        message = Message(
            topic=topic,
            payload=payload,
            priority=priority,
            max_retries=self._max_retries
        )
        
        # 持久化消息
        self._persist_message(message)
        
        # 确保队列存在
        if topic not in self._queues:
            self._queues[topic] = asyncio.PriorityQueue()
        
        # 放入队列（使用优先级和时间戳作为排序键）
        await self._queues[topic].put((priority.value, message.created_at, message))
        
        logger.info("消息已发布: id=%s, topic=%s, priority=%s", 
                   message.id, topic, priority.name)
        
        # 通知订阅者
        await self._notify_subscribers(topic, message)
        
        return message
    
    async def subscribe(self, topic: str, handler: Callable) -> None:
        """
        订阅消息主题
        
        Args:
            topic: 消息主题
            handler: 消息处理函数，接收Message参数
        """
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        
        self._subscribers[topic].append(handler)
        logger.info("已订阅主题: %s, 处理函数: %s", topic, handler.__name__)
    
    async def _notify_subscribers(self, topic: str, message: Message) -> None:
        """通知订阅者"""
        handlers = self._subscribers.get(topic, [])
        
        for handler in handlers:
            try:
                await handler(message)
            except Exception as e:
                logger.error("订阅者处理消息失败: %s, 错误: %s", 
                           handler.__name__, e)
    
    async def consume(self, topic: str, handler: Callable) -> None:
        """
        消费队列中的消息
        
        Args:
            topic: 消息主题
            handler: 消息处理函数
        """
        if topic not in self._queues:
            self._queues[topic] = asyncio.PriorityQueue()
        
        queue = self._queues[topic]
        
        while self._running:
            try:
                # 等待消息
                priority, timestamp, message = await asyncio.wait_for(
                    queue.get(), timeout=1.0
                )
                
                # 检查是否已在处理
                if message.id in self._processing:
                    continue
                
                self._processing.add(message.id)
                
                try:
                    # 处理消息
                    await self._process_message(message, handler)
                finally:
                    self._processing.discard(message.id)
                    
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error("消费消息失败: %s", e)
    
    async def _process_message(self, message: Message, handler: Callable) -> None:
        """处理单个消息"""
        try:
            # 更新状态为处理中
            message.status = MessageStatus.PROCESSING
            self._update_message_status(message.id, MessageStatus.PROCESSING)
            
            # 调用处理函数
            await handler(message)
            
            # 处理成功
            message.status = MessageStatus.COMPLETED
            message.processed_at = time.time()
            self._update_message_status(message.id, MessageStatus.COMPLETED)
            
            logger.info("消息处理成功: id=%s", message.id)
            
        except Exception as e:
            # 处理失败
            message.retry_count += 1
            message.error = str(e)
            
            if message.retry_count < message.max_retries:
                # 重试
                message.status = MessageStatus.PENDING
                self._update_message_status(message.id, MessageStatus.PENDING, str(e))
                
                # 重新放入队列（使用当前时间确保重试消息不被无限延迟）
                await self._queues[message.topic].put(
                    (message.priority.value, time.time(), message)
                )
                
                logger.warning("消息处理失败，将重试: id=%s, retry=%d/%d", 
                             message.id, message.retry_count, message.max_retries)
            else:
                # 超过重试次数，移入死信队列
                message.status = MessageStatus.DEAD_LETTER
                self._update_message_status(message.id, MessageStatus.DEAD_LETTER, str(e))
                
                # 发送到死信队列
                dlq_topic = f"{message.topic}.dlq"
                await self.publish(dlq_topic, message.to_dict(), 
                                 MessagePriority.LOW)
                
                logger.error("消息处理失败，已移入死信队列: id=%s, error=%s", 
                           message.id, e)
    
    def start(self) -> None:
        """启动消息队列"""
        self._running = True
        logger.info("消息队列已启动")
    
    def stop(self) -> None:
        """停止消息队列"""
        self._running = False
        
        # 取消所有任务
        for task in self._tasks:
            task.cancel()
        
        logger.info("消息队列已停止")
    
    async def get_queue_size(self, topic: str) -> int:
        """获取队列大小"""
        if topic in self._queues:
            return self._queues[topic].qsize()
        return 0
    
    async def get_all_queue_sizes(self) -> Dict[str, int]:
        """获取所有队列大小"""
        return {topic: queue.qsize() for topic, queue in self._queues.items()}
    
    def get_pending_messages(self, topic: Optional[str] = None) -> List[Message]:
        """获取待处理消息（从数据库）"""
        if not self._db_path:
            return []
        
        try:
            conn = sqlite3.connect(self._db_path)
            cursor = conn.cursor()
            
            if topic:
                cursor.execute("""
                    SELECT * FROM messages 
                    WHERE topic = ? AND status = 'pending'
                    ORDER BY priority DESC, created_at ASC
                """, (topic,))
            else:
                cursor.execute("""
                    SELECT * FROM messages 
                    WHERE status = 'pending'
                    ORDER BY topic, priority DESC, created_at ASC
                """)
            
            rows = cursor.fetchall()
            conn.close()
            
            messages = []
            for row in rows:
                message = Message(
                    id=row[0],
                    topic=row[1],
                    payload=json.loads(row[2]) if row[2] else None,
                    priority=MessagePriority(row[3]),
                    status=MessageStatus(row[4]),
                    created_at=row[5],
                    processed_at=row[6],
                    retry_count=row[7],
                    max_retries=row[8],
                    error=row[9]
                )
                messages.append(message)
            
            return messages
            
        except Exception as e:
            logger.error("获取待处理消息失败: %s", e)
            return []
    
    def clear_queue(self, topic: str) -> int:
        """清空队列"""
        if topic in self._queues:
            queue = self._queues[topic]
            count = queue.qsize()
            
            # 清空队列
            while not queue.empty():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            
            logger.info("已清空队列: %s, 消息数量: %d", topic, count)
            return count
        
        return 0
