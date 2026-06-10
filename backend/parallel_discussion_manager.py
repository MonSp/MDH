"""
ParallelDiscussionManager - 并行讨论管理器

使用asyncio.gather实现并行讨论，替代原有的串行循环。
支持动态团队，不再依赖固定的AgentRole枚举。
"""
import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.message import Msg

from agent import _extract_text
from agent_pool import AgentPool, AgentInstance

logger = logging.getLogger("parallel_discussion_manager")


class ParallelDiscussionManager:
    """
    并行讨论管理器
    
    使用asyncio.gather实现并行讨论，支持并发控制和超时处理。
    支持动态团队，不再依赖固定的AgentRole枚举。
    """
    
    def __init__(
        self,
        agent_pool: AgentPool,
        max_concurrent: int = 5,
        timeout: float = 30.0
    ):
        """
        初始化并行讨论管理器
        
        Args:
            agent_pool: Agent池管理器
            max_concurrent: 最大并发数
            timeout: 单个Agent响应超时时间（秒）
        """
        self._agent_pool = agent_pool
        self._max_concurrent = max_concurrent
        self._timeout = timeout
        self._semaphore = asyncio.Semaphore(max_concurrent)
        
        logger.info("ParallelDiscussionManager 初始化完成 (max_concurrent=%d, timeout=%.1f)", 
                   max_concurrent, timeout)
    
    async def run_discussion(
        self,
        topic: str,
        agent_ids: List[str],
        max_rounds: int = 2,
        on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
    ) -> List[Dict[str, Any]]:
        """
        运行并行讨论
        
        Args:
            topic: 讨论主题
            agent_ids: 参与讨论的Agent ID列表
            max_rounds: 最大轮数
            on_message: 消息回调函数
            
        Returns:
            讨论结果列表
        """
        all_discussions: List[Dict[str, Any]] = []
        
        for current_round in range(1, max_rounds + 1):
            logger.info("开始第 %d 轮讨论", current_round)
            round_start_time = time.time()
            
            # 构建上下文
            previous_context = self._build_previous_context(all_discussions)
            
            # 并行调用所有Agent
            tasks = [
                self._ask_agent(
                    agent_id=agent_id,
                    topic=topic,
                    round_num=current_round,
                    previous_context=previous_context
                )
                for agent_id in agent_ids
            ]
            
            # 使用asyncio.gather并行执行
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 处理结果
            round_results = []
            for agent_id, result in zip(agent_ids, results):
                agent_instance = self._agent_pool.get_agent_by_id(agent_id)
                agent_name = agent_instance.config.name if agent_instance else agent_id
                agent_role = agent_instance.config.role if agent_instance else "unknown"
                
                if isinstance(result, Exception):
                    logger.error("Agent %s 在第 %d 轮讨论中失败: %s", 
                               agent_id, current_round, result)
                    # 记录失败结果
                    entry = {
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "role": agent_role,
                        "content": f"[讨论失败: {str(result)}]",
                        "stance": "neutral",
                        "confidence": 0.0,
                        "round": current_round,
                        "error": str(result)
                    }
                else:
                    text, stance, confidence = result
                    entry = {
                        "agent_id": agent_id,
                        "agent_name": agent_name,
                        "role": agent_role,
                        "content": text,
                        "stance": stance,
                        "confidence": confidence,
                        "round": current_round
                    }
                    
                    # 调用消息回调
                    if on_message:
                        try:
                            await on_message(agent_id, text, "", 
                                           stance=stance, confidence=confidence)
                        except Exception as e:
                            logger.error("消息回调失败: %s", e)
                
                round_results.append(entry)
                all_discussions.append(entry)
            
            round_elapsed = time.time() - round_start_time
            logger.info("第 %d 轮讨论完成，耗时 %.2f 秒", current_round, round_elapsed)
            
            # 检查是否达成共识
            if current_round < max_rounds:
                should_continue = await self._evaluate_convergence(
                    topic, all_discussions
                )
                if not should_continue:
                    logger.info("讨论已在第 %d 轮达成共识", current_round)
                    break
        
        logger.info("讨论完成，共 %d 轮，%d 条讨论", 
                   max_rounds, len(all_discussions))
        
        return all_discussions
    
    async def _ask_agent(
        self,
        agent_id: str,
        topic: str,
        round_num: int,
        previous_context: str
    ) -> tuple:
        """
        向单个Agent提问
        
        Args:
            agent_id: Agent ID
            topic: 讨论主题
            round_num: 当前轮数
            previous_context: 之前的讨论上下文
            
        Returns:
            (text, stance, confidence) 元组
        """
        async with self._semaphore:
            # 获取Agent实例
            agent_instance = self._agent_pool.get_agent_by_id(agent_id)
            if not agent_instance:
                raise RuntimeError(f"Agent {agent_id} 不存在")
            
            agent = agent_instance.agent
            agent_name = agent_instance.config.name
            agent_role = agent_instance.config.role
            
            # 构建提示词
            if round_num == 1:
                prompt = (
                    f"当前讨论议题：{topic}\n"
                    f"之前的讨论：\n{previous_context}\n\n"
                    f"请以{agent_name}（{agent_role}）的身份发表你的看法和建议（2-3句话）。"
                    f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                )
            else:
                prompt = (
                    f"当前讨论议题：{topic}\n"
                    f"当前是第{round_num}轮讨论\n"
                    f"之前的讨论：\n{previous_context}\n\n"
                    f"请基于之前的讨论，以{agent_name}（{agent_role}）的身份发表你的进一步看法。"
                    f"你可以引用或回应其他同事的观点，提出补充建议或修正意见（2-3句话）。"
                    f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                )
            
            # 发送消息并等待响应
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            
            try:
                response = await asyncio.wait_for(
                    agent.reply(msg),
                    timeout=self._timeout
                )
                text = _extract_text(response)
                
                # 解析立场和置信度
                stance, confidence = self._parse_stance(text)
                
                return text, stance, confidence
                
            except asyncio.TimeoutError:
                raise RuntimeError(f"Agent {agent_id} ({agent_name}) 响应超时")
            except Exception as e:
                raise RuntimeError(f"Agent {agent_id} ({agent_name}) 响应失败: {str(e)}")
    
    def _parse_stance(self, text: str) -> tuple:
        """
        从响应中解析立场和置信度
        
        Args:
            text: 响应文本
            
        Returns:
            (stance, confidence) 元组
        """
        import re
        
        # 解析立场
        stance_match = re.search(r'\[STANCE:(\w+)\]', text)
        if stance_match:
            stance = stance_match.group(1).lower()
        else:
            stance = "neutral"
        
        # 解析置信度
        confidence_match = re.search(r'\[CONFIDENCE:([\d.]+)\]', text)
        if confidence_match:
            confidence = float(confidence_match.group(1))
        else:
            confidence = 0.5
        
        return stance, confidence
    
    def _build_previous_context(self, discussions: List[Dict[str, Any]]) -> str:
        """
        构建之前的讨论上下文
        
        Args:
            discussions: 讨论记录列表
            
        Returns:
            上下文字符串
        """
        if not discussions:
            return "（暂无讨论）"
        
        context_parts = []
        for entry in discussions[-10:]:  # 只取最近10条
            agent_name = entry.get("agent_name", entry.get("role", "未知"))
            content = entry.get("content", "")
            round_num = entry.get("round", 0)
            context_parts.append(f"[第{round_num}轮] {agent_name}: {content}")
        
        return "\n".join(context_parts)
    
    async def _evaluate_convergence(
        self,
        topic: str,
        discussions: List[Dict[str, Any]]
    ) -> bool:
        """
        评估讨论是否达成共识
        
        Args:
            topic: 讨论主题
            discussions: 讨论记录
            
        Returns:
            bool: True表示需要继续讨论，False表示已达成共识
        """
        if len(discussions) < 2:
            return True
        
        # 获取最近一轮的讨论
        recent_round = max(d.get("round", 0) for d in discussions)
        recent_discussions = [
            d for d in discussions if d.get("round") == recent_round
        ]
        
        if len(recent_discussions) < 2:
            return True
        
        # 检查立场一致性
        stances = [d.get("stance", "neutral") for d in recent_discussions]
        unique_stances = set(stances)
        
        # 如果所有立场相同，认为达成共识
        if len(unique_stances) == 1:
            logger.info("所有Agent立场一致: %s", unique_stances.pop())
            return False
        
        # 检查置信度
        confidences = [d.get("confidence", 0.5) for d in recent_discussions]
        avg_confidence = sum(confidences) / len(confidences)
        
        # 如果平均置信度很高，认为达成共识
        if avg_confidence > 0.8:
            logger.info("平均置信度很高: %.2f", avg_confidence)
            return False
        
        return True
    
    async def summarize_discussion(
        self,
        topic: str,
        discussions: List[Dict[str, Any]],
        summarizer_id: str
    ) -> str:
        """
        总结讨论结果
        
        Args:
            topic: 讨论主题
            discussions: 讨论记录
            summarizer_id: 总结者Agent ID
            
        Returns:
            总结文本
        """
        # 获取Agent实例
        agent_instance = self._agent_pool.get_agent_by_id(summarizer_id)
        if not agent_instance:
            raise RuntimeError(f"Agent {summarizer_id} 不存在")
        
        agent = agent_instance.agent
        agent_name = agent_instance.config.name
        
        # 构建讨论摘要
        discussion_summary = self._build_previous_context(discussions)
        
        prompt = (
            f"你是{agent_name}。以下是关于「{topic}」的多轮讨论内容，请给出最终总结。\n\n"
            f"讨论内容：\n{discussion_summary}\n\n"
            f"请综合各方观点，给出简洁的总结和最终结论（3-4句话）。"
        )
        
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        
        try:
            response = await asyncio.wait_for(
                agent.reply(msg),
                timeout=self._timeout
            )
            text = _extract_text(response)
            return text
            
        except asyncio.TimeoutError:
            raise RuntimeError(f"Agent {summarizer_id} ({agent_name}) 总结超时")
        except Exception as e:
            raise RuntimeError(f"Agent {summarizer_id} ({agent_name}) 总结失败: {str(e)}")
