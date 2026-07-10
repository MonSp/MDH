"""
WorkspaceSync - 工作区同步器

支持本地和远端工作区的状态同步。
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

logger = logging.getLogger("workspace_sync")


@dataclass
class FileState:
    """文件状态"""
    path: str
    hash: str
    size: int
    modified_at: float
    owner_agent_id: str


@dataclass
class WorkspaceState:
    """工作区状态"""
    workspace_id: str
    root_path: str
    files: Dict[str, FileState] = field(default_factory=dict)
    locked_files: Set[str] = field(default_factory=set)
    last_sync: float = 0.0


class WorkspaceSync:
    """
    工作区同步器
    
    支持本地和远端工作区的状态同步。
    """
    
    def __init__(
        self,
        workspace_id: str,
        root_path: str,
        sync_interval: float = 5.0,
    ):
        """
        初始化工作区同步器
        
        Args:
            workspace_id: 工作区ID
            root_path: 根路径
            sync_interval: 同步间隔（秒）
        """
        self._workspace_id = workspace_id
        self._root_path = root_path
        self._sync_interval = sync_interval
        
        # 工作区状态
        self._state = WorkspaceState(
            workspace_id=workspace_id,
            root_path=root_path,
        )
        
        # 同步任务
        self._sync_task: Optional[asyncio.Task] = None
        
        # 冲突检测回调
        self._on_conflict: Optional[Callable[[List[Dict[str, Any]]], Awaitable[None]]] = None
        
        logger.info("WorkspaceSync 初始化完成 (workspace=%s)", workspace_id)
    
    def set_conflict_callback(self, callback: Callable[[List[Dict[str, Any]]], Awaitable[None]]) -> None:
        """
        设置冲突检测回调
        
        Args:
            callback: 冲突检测回调函数
        """
        self._on_conflict = callback
    
    async def start(self) -> None:
        """启动同步器"""
        if self._sync_task:
            return
        
        self._sync_task = asyncio.create_task(self._sync_loop())
        logger.info("WorkspaceSync 已启动")
    
    async def stop(self) -> None:
        """停止同步器"""
        if self._sync_task:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass
            self._sync_task = None
        logger.info("WorkspaceSync 已停止")
    
    async def _sync_loop(self) -> None:
        """同步循环"""
        while True:
            try:
                await self._sync_workspace()
                await asyncio.sleep(self._sync_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("同步循环异常: %s", e)
                await asyncio.sleep(5)
    
    async def _sync_workspace(self) -> None:
        """同步工作区"""
        # 扫描本地文件
        local_files = self._scan_local_files()
        
        # 检测冲突
        conflicts = self._detect_conflicts(local_files)
        
        if conflicts:
            logger.warning("检测到 %d 个文件冲突", len(conflicts))
            if self._on_conflict:
                await self._on_conflict(conflicts)
        
        # 更新状态
        self._state.files = local_files
        self._state.last_sync = time.time()
    
    def _scan_local_files(self) -> Dict[str, FileState]:
        """
        扫描本地文件
        
        Returns:
            文件状态字典
        """
        files = {}
        
        if not os.path.exists(self._root_path):
            return files
        
        for root, dirs, filenames in os.walk(self._root_path):
            for filename in filenames:
                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, self._root_path)
                
                try:
                    stat = os.stat(filepath)
                    files[rel_path] = FileState(
                        path=rel_path,
                        hash=self._compute_hash(filepath),
                        size=stat.st_size,
                        modified_at=stat.st_mtime,
                        owner_agent_id="local",
                    )
                except Exception as e:
                    logger.warning("扫描文件失败: %s - %s", filepath, e)
        
        return files
    
    def _compute_hash(self, filepath: str) -> str:
        """
        计算文件哈希
        
        Args:
            filepath: 文件路径
            
        Returns:
            文件哈希值
        """
        import hashlib
        
        try:
            with open(filepath, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return ""
    
    def _detect_conflicts(
        self,
        local_files: Dict[str, FileState],
    ) -> List[Dict[str, Any]]:
        """
        检测文件冲突
        
        Args:
            local_files: 本地文件状态
            
        Returns:
            冲突列表
        """
        conflicts = []
        
        for path, local_state in local_files.items():
            remote_state = self._state.files.get(path)
            
            if remote_state and remote_state.hash != local_state.hash:
                # 文件内容不同，可能有冲突
                if path in self._state.locked_files:
                    # 文件被锁定，有冲突
                    conflicts.append({
                        "path": path,
                        "local_hash": local_state.hash,
                        "remote_hash": remote_state.hash,
                        "locked_by": remote_state.owner_agent_id,
                    })
        
        return conflicts
    
    def lock_file(self, path: str, agent_id: str) -> bool:
        """
        锁定文件
        
        Args:
            path: 文件路径
            agent_id: 锁定者智能体ID
            
        Returns:
            是否锁定成功
        """
        if path in self._state.locked_files:
            return False
        
        self._state.locked_files.add(path)
        
        # 更新文件所有者
        if path in self._state.files:
            self._state.files[path].owner_agent_id = agent_id
        
        logger.info("文件已锁定: %s (by %s)", path, agent_id)
        return True
    
    def unlock_file(self, path: str, agent_id: str) -> bool:
        """
        解锁文件
        
        Args:
            path: 文件路径
            agent_id: 解锁者智能体ID
            
        Returns:
            是否解锁成功
        """
        if path not in self._state.locked_files:
            return False
        
        # 检查是否是锁定者
        file_state = self._state.files.get(path)
        if file_state and file_state.owner_agent_id != agent_id:
            return False
        
        self._state.locked_files.discard(path)
        logger.info("文件已解锁: %s (by %s)", path, agent_id)
        return True
    
    def get_state(self) -> WorkspaceState:
        """
        获取工作区状态
        
        Returns:
            工作区状态
        """
        return self._state
    
    def update_remote_state(self, remote_state: WorkspaceState) -> None:
        """
        更新远端状态
        
        Args:
            remote_state: 远端工作区状态
        """
        # 合并远端文件状态
        for path, file_state in remote_state.files.items():
            if path not in self._state.files:
                self._state.files[path] = file_state
            else:
                # 更新远端文件的所有者信息
                existing = self._state.files[path]
                if existing.owner_agent_id != file_state.owner_agent_id:
                    logger.info("文件所有者变更: %s (%s -> %s)", 
                              path, existing.owner_agent_id, file_state.owner_agent_id)
        
        # 合并锁定文件
        self._state.locked_files.update(remote_state.locked_files)
        
        logger.info("远端状态已更新: %d 个文件", len(remote_state.files))
    
    async def resolve_conflict(
        self,
        path: str,
        resolution: str,  # 'local' | 'remote' | 'merge'
        agent_id: str,
    ) -> bool:
        """
        解决文件冲突
        
        Args:
            path: 文件路径
            resolution: 解决策略
            agent_id: 解决者智能体ID
            
        Returns:
            是否解决成功
        """
        if path not in self._state.locked_files:
            return False
        
        if resolution == "local":
            # 保留本地版本
            self.unlock_file(path, agent_id)
        elif resolution == "remote":
            # 采用远端版本
            # TODO: 实现远端文件拉取
            self.unlock_file(path, agent_id)
        elif resolution == "merge":
            # 合并文件
            # TODO: 实现文件合并逻辑
            self.unlock_file(path, agent_id)
        
        return True
