"""
Fallback Chain - 回退链机制

扩展 DynamicRouter 和 WorkflowEngine 支持显式回退链：
1. DynamicRouter: route() 返回首选路径和备选路径列表
2. WorkflowEngine: 节点失败时自动切换到备选执行器
3. 回退策略在任务规划阶段提前声明
4. 回退全部失败后自动触发 CompensationEngine 补偿
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("fallback_chain")


@dataclass
class FallbackStep:
    """回退步骤"""
    target_id: str  # 目标ID（部门ID或执行器ID）
    reason: str  # 回退原因
    confidence: float = 0.0  # 置信度


@dataclass
class FallbackChain:
    """回退链"""
    primary: str  # 首选目标
    fallbacks: list[FallbackStep] = field(default_factory=list)  # 备选路径
    strategy: str = "sequential"  # 回退策略：sequential（依次尝试）/ parallel（并行尝试）
    max_attempts: int = 3  # 最大尝试次数

    def get_all_targets(self) -> list[str]:
        """获取所有目标（首选+备选）"""
        return [self.primary] + [f.target_id for f in self.fallbacks]


@dataclass
class FallbackResult:
    """回退执行结果"""
    success: bool
    target_id: str  # 最终执行的目标
    attempts: int  # 尝试次数
    results: list[dict[str, Any]] = field(default_factory=list)  # 每次尝试的结果
    fallback_used: bool = False  # 是否使用了回退
    compensated: bool = False  # 是否触发了补偿


class FallbackExecutor:
    """
    回退执行器

    职责：
    1. 按回退链依次尝试执行
    2. 记录每次尝试的结果
    3. 全部失败时触发补偿
    """

    def __init__(self, compensation_callback: Callable | None = None):
        """
        Args:
            compensation_callback: 补偿回调函数，签名：async def callback(context) -> bool
        """
        self._compensation_callback = compensation_callback

    async def execute_with_fallback(
        self,
        chain: FallbackChain,
        executor: Callable[[str], Any],
        context: dict[str, Any] | None = None,
    ) -> FallbackResult:
        """
        带回退的执行

        Args:
            chain: 回退链
            executor: 执行函数，签名：async def executor(target_id) -> result
            context: 执行上下文

        Returns:
            FallbackResult
        """
        all_targets = chain.get_all_targets()
        attempts = 0
        results = []
        fallback_used = False

        for target_id in all_targets:
            if attempts >= chain.max_attempts:
                break

            attempts += 1

            try:
                result = await executor(target_id)
                results.append({
                    "target_id": target_id,
                    "success": True,
                    "result": result,
                    "attempt": attempts,
                })

                # 执行成功
                return FallbackResult(
                    success=True,
                    target_id=target_id,
                    attempts=attempts,
                    results=results,
                    fallback_used=fallback_used,
                )

            except Exception as e:
                logger.warning("目标 %s 执行失败 (尝试 %d/%d): %s",
                             target_id, attempts, chain.max_attempts, str(e))
                results.append({
                    "target_id": target_id,
                    "success": False,
                    "error": str(e),
                    "attempt": attempts,
                })
                fallback_used = True

        # 所有目标都失败，尝试补偿
        compensated = False
        if self._compensation_callback and context:
            try:
                compensated = await self._compensation_callback(context)
                logger.info("补偿执行%s", "成功" if compensated else "失败")
            except Exception as e:
                logger.error("补偿执行异常: %s", str(e))

        return FallbackResult(
            success=False,
            target_id=all_targets[-1] if all_targets else "",
            attempts=attempts,
            results=results,
            fallback_used=fallback_used,
            compensated=compensated,
        )


class RoutingFallbackBuilder:
    """
    路由回退链构建器

    从 DynamicRouter 的候选列表构建回退链
    """

    @staticmethod
    def build_from_candidates(
        candidates: list[dict[str, Any]],
        max_fallbacks: int = 2,
    ) -> FallbackChain:
        """
        从候选列表构建回退链

        Args:
            candidates: 候选列表，按得分降序排列
            max_fallbacks: 最大备选数

        Returns:
            FallbackChain
        """
        if not candidates:
            raise ValueError("候选列表为空")

        primary = candidates[0]["dept_id"]
        fallbacks = []

        for i, candidate in enumerate(candidates[1:max_fallbacks + 1], 1):
            fallbacks.append(FallbackStep(
                target_id=candidate["dept_id"],
                reason=f"备选路径{i}，得分: {candidate.get('score', 0):.4f}",
                confidence=candidate.get("score", 0),
            ))

        return FallbackChain(
            primary=primary,
            fallbacks=fallbacks,
        )


class WorkflowFallbackBuilder:
    """
    工作流回退链构建器

    为工作流节点构建备选执行器回退链
    """

    @staticmethod
    def build_for_node(
        node_dept_id: str,
        alternative_executors: list[str],
    ) -> FallbackChain:
        """
        为工作流节点构建回退链

        Args:
            node_dept_id: 节点的主要部门ID
            alternative_executors: 备选执行器ID列表

        Returns:
            FallbackChain
        """
        fallbacks = [
            FallbackStep(
                target_id=executor_id,
                reason="备选执行器",
            )
            for executor_id in alternative_executors
        ]

        return FallbackChain(
            primary=node_dept_id,
            fallbacks=fallbacks,
        )


if __name__ == "__main__":
    # 测试
    import asyncio

    async def test():
        # 测试路由回退链构建
        candidates = [
            {"dept_id": "frontend", "score": 0.9},
            {"dept_id": "fullstack", "score": 0.7},
            {"dept_id": "backend", "score": 0.5},
        ]

        chain = RoutingFallbackBuilder.build_from_candidates(candidates)
        print(f"首选: {chain.primary}")
        print(f"备选: {[f.target_id for f in chain.fallbacks]}")
        print(f"所有目标: {chain.get_all_targets()}")

        # 测试回退执行
        call_count = 0

        async def failing_executor(target_id):
            nonlocal call_count
            call_count += 1
            if target_id == "frontend":
                raise ValueError("前端服务不可用")
            return {"status": "ok", "target": target_id}

        executor = FallbackExecutor()
        result = await executor.execute_with_fallback(chain, failing_executor)

        print("\n执行结果:")
        print(f"  成功: {result.success}")
        print(f"  最终目标: {result.target_id}")
        print(f"  尝试次数: {result.attempts}")
        print(f"  使用回退: {result.fallback_used}")

    asyncio.run(test())
