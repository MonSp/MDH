"""
KeyManager - 独立API密钥管理模块

为每个Agent角色提供独立的API密钥和rate limit管理。
支持字符串类型的role，不再限制为AgentRole枚举。
"""
import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("key_manager")


@dataclass
class KeyConfig:
    """API密钥配置"""
    api_key: str
    base_url: str = ""
    rate_limit: int = 100  # 每分钟最大请求数
    model_name: str = ""  # 可选：覆盖默认模型
    provider: str = ""  # 可选：覆盖默认provider


@dataclass
class UsageRecord:
    """使用记录"""
    count: int = 0
    last_reset: float = field(default_factory=time.time)
    last_used: float = 0.0


class KeyManager:
    """
    独立API密钥管理器

    为每个Agent角色提供独立的API密钥配置和rate limit管理。
    支持字符串类型的role，不再限制为AgentRole枚举。
    """

    def __init__(self, default_config: KeyConfig | None = None):
        """
        初始化KeyManager

        Args:
            default_config: 默认配置，未单独配置的角色使用此配置
        """
        self._keys: dict[str, KeyConfig] = {}
        self._usage: dict[str, UsageRecord] = {}
        self._default_config = default_config

        logger.info("KeyManager 初始化完成")

    def configure(self, role: str, config: KeyConfig) -> None:
        """
        为指定角色配置API密钥

        Args:
            role: 角色名称（字符串）
            config: 密钥配置
        """
        self._keys[role] = config
        if role not in self._usage:
            self._usage[role] = UsageRecord()

        logger.info("已配置角色 %s 的API密钥", role)

    def get_config(self, role: str) -> KeyConfig:
        """
        获取角色的API密钥配置

        Args:
            role: 角色名称（字符串）

        Returns:
            KeyConfig: 密钥配置

        Raises:
            ValueError: 角色未配置且无默认配置
        """
        if role in self._keys:
            return self._keys[role]

        if self._default_config:
            return self._default_config

        raise ValueError(f"角色 {role} 未配置API密钥，且无默认配置")

    def get_default_provider(self) -> str:
        """获取默认provider"""
        if self._default_config and self._default_config.provider:
            return self._default_config.provider
        return "deepseek"

    def get_default_api_key(self) -> str:
        """获取默认API密钥"""
        if self._default_config:
            return self._default_config.api_key
        return ""

    def get_default_base_url(self) -> str:
        """获取默认base_url"""
        if self._default_config:
            return self._default_config.base_url
        return ""

    def check_rate_limit(self, role: str) -> bool:
        """
        检查角色是否超出rate limit

        Args:
            role: 角色名称（字符串）

        Returns:
            bool: True表示可以发送请求，False表示已超出限制
        """
        config = self.get_config(role)
        usage = self._usage.get(role, UsageRecord())

        # 每分钟重置计数
        current_time = time.time()
        if current_time - usage.last_reset > 60:
            usage.count = 0
            usage.last_reset = current_time
            self._usage[role] = usage

        return usage.count < config.rate_limit

    def record_usage(self, role: str) -> None:
        """
        记录角色的API调用

        Args:
            role: 角色名称（字符串）
        """
        if role not in self._usage:
            self._usage[role] = UsageRecord()

        self._usage[role].count += 1
        self._usage[role].last_used = time.time()

        logger.debug("记录角色 %s 的API调用，当前计数: %d",
                    role, self._usage[role].count)

    def get_usage_stats(self, role: str) -> dict:
        """
        获取角色的使用统计

        Args:
            role: 角色名称（字符串）

        Returns:
            Dict: 使用统计信息
        """
        usage = self._usage.get(role, UsageRecord())
        config = self.get_config(role)

        return {
            "role": role,
            "count": usage.count,
            "rate_limit": config.rate_limit,
            "remaining": max(0, config.rate_limit - usage.count),
            "last_used": usage.last_used,
            "last_reset": usage.last_reset
        }

    def get_all_stats(self) -> dict[str, dict]:
        """
        获取所有角色的使用统计

        Returns:
            Dict: 所有角色的使用统计
        """
        stats = {}
        for role in set(list(self._keys.keys()) + list(self._usage.keys())):
            try:
                stats[role] = self.get_usage_stats(role)
            except ValueError:
                # 角色未配置
                stats[role] = {"configured": False}

        return stats

    def reset_usage(self, role: str | None = None) -> None:
        """
        重置使用计数

        Args:
            role: 指定角色，None表示重置所有
        """
        if role:
            if role in self._usage:
                self._usage[role] = UsageRecord()
                logger.info("已重置角色 %s 的使用计数", role)
        else:
            for r in self._usage:
                self._usage[r] = UsageRecord()
            logger.info("已重置所有角色的使用计数")

    def remove_config(self, role: str) -> bool:
        """
        移除角色的配置

        Args:
            role: 角色名称（字符串）

        Returns:
            bool: 是否成功移除
        """
        if role in self._keys:
            del self._keys[role]
            if role in self._usage:
                del self._usage[role]
            logger.info("已移除角色 %s 的配置", role)
            return True
        return False
