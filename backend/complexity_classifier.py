"""
ComplexityClassifier - 复杂度判定器

根据用户消息自动判定任务复杂度（simple/complex）。
采用两层策略：规则引擎（快速）+ LLM 语义分析（精确）。
"""

import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass

from chat_agent import Msg

from agent import _extract_text

logger = logging.getLogger("complexity_classifier")


@dataclass
class ComplexityResult:
    """复杂度判定结果"""
    level: str          # "simple" | "complex"
    confidence: float   # 0.0 - 1.0
    reason: str
    method: str         # "rule" | "llm"


# 简单模式：单步浏览器指令、单文件操作
SIMPLE_PATTERNS = [
    # 浏览器操作
    r'打开\s*\S+',
    r'访问\s*\S+',
    r'导航到\s*\S+',
    r'搜索\s*\S+',
    r'搜索一下\s*\S+',
    r'点击\s*\S+',
    r'填写\s*\S+',
    r'输入\s*\S+',
    r'截图',
    r'截屏',
    r'获取.*截图',
    r'滚动\s*(页面|向下|向上)',
    r'等待\s*\d+\s*(秒|毫秒)',
    r'关闭\s*(标签页|页面)',
    r'切换到\s*\S+',
    r'新建\s*(标签页|页面)',
    # 文件操作
    r'读取\s*(文件|内容)',
    r'打开\s*(文件|目录)',
    r'保存\s*(文件|内容)',
    r'创建\s*(文件|目录)',
    r'删除\s*(文件|目录)',
    r'复制\s*(文件|目录)',
    r'移动\s*(文件|目录)',
    # 简单查询
    r'(什么是|解释一下|告诉我)\s*\S+',
    r'(帮我|请)\s*(查一下|看一下|找一下)\s*\S+',
]

# 复杂模式：多步骤、跨部门、多动词
COMPLEX_PATTERNS = [
    # 多步骤连词
    r'首先.*然后.*最后',
    r'第一步.*第二步.*第三步',
    r'先.*再.*后',
    r'先.*接着.*然后',
    r'首先.*接着.*最后',
    # 跨部门关键词组合
    r'前端.*后端',
    r'后端.*前端',
    r'设计.*开发',
    r'开发.*测试',
    r'测试.*部署',
    r'分析.*实现',
    r'实现.*验证',
    # 复杂任务描述
    r'工作流',
    r'流程',
    r'项目',
    r'系统',
    r'架构',
    r'重构',
    r'优化.*性能',
    r'搭建.*环境',
    r'部署.*上线',
    r'完整.*方案',
]

# 跨部门关键词（用于动词计数辅助判断）
CROSS_DEPT_KEYWORDS = [
    '前端', '后端', '数据库', '测试', '部署', '运维',
    '设计', '架构', 'API', '接口', '服务', '微服务',
    'frontend', 'backend', 'database', 'test', 'deploy',
]

# 动词列表（用于动词计数）
VERBS = [
    '设计', '开发', '实现', '测试', '部署', '分析', '创建', '编写',
    '优化', '修复', '重构', '搭建', '配置', '集成', '迁移', '升级',
    '审查', '验证', '评估', '规划', '设计', '实现', '维护',
]


class ComplexityClassifier:
    """复杂度判定器"""

    def __init__(self, get_model_fn: Callable = None, kernel_integration=None):
        """
        Args:
            get_model_fn: 获取 LLM 模型的函数，签名 (role) -> Agent
            kernel_integration: KernelIntegration 实例（agent-kernel 主状态层）
        """
        self._get_model = get_model_fn
        self._kernel = kernel_integration
        self._classifier_entity_id: int | None = None

    async def _ensure_classifier_entity(self) -> int | None:
        """确保 kernel 中存在用于分类的 CEO 实体，返回 entity_id。"""
        if self._classifier_entity_id is not None:
            return self._classifier_entity_id
        if not self._kernel or not self._kernel.is_available():
            return None
        try:
            agent = self._kernel.sync_agent_to_kernel(
                agent_id="ceo-classifier",
                name="CEO分类器",
                department="Management",
                company_role="CTO",
            )
            if agent:
                self._classifier_entity_id = agent.entity_id
                return self._classifier_entity_id
        except Exception as e:
            logger.debug("创建分类器实体失败: %s", e)
        return None

    async def classify(self, message: str) -> ComplexityResult:
        """
        判定任务复杂度

        流程：
        1. 规则引擎快速判定
        2. agent-kernel agent_decide（替代 LLM）
        3. 降级到 agentscope LLM
        4. 最终降级：默认复杂路径

        Args:
            message: 用户消息

        Returns:
            ComplexityResult
        """
        # 1. 规则引擎判定
        rule_result = self._rule_classify(message)
        if rule_result and rule_result.confidence >= 0.7:
            logger.info(
                "规则引擎判定: level=%s confidence=%.2f reason=%s",
                rule_result.level, rule_result.confidence, rule_result.reason
            )
            return rule_result

        # 2. agent-kernel 分类（主路径）
        kernel_result = await self._kernel_classify(message)
        if kernel_result:
            logger.info(
                "Kernel 判定: level=%s confidence=%.2f reason=%s",
                kernel_result.level, kernel_result.confidence, kernel_result.reason
            )
            return kernel_result

        # 3. 降级到 agentscope LLM
        if self._get_model:
            try:
                llm_result = await self._llm_classify(message)
                logger.info(
                    "LLM 判定: level=%s confidence=%.2f reason=%s",
                    llm_result.level, llm_result.confidence, llm_result.reason
                )
                return llm_result
            except Exception as e:
                logger.warning("LLM 分类失败，降级到复杂路径: %s", e)

        # 4. 最终降级：默认走复杂路径（宁重勿轻）
        fallback = ComplexityResult(
            level="complex",
            confidence=0.5,
            reason="规则引擎和LLM均无法确定，降级到复杂路径",
            method="fallback"
        )
        logger.info("降级判定: level=%s confidence=%.2f", fallback.level, fallback.confidence)
        return fallback

    def _rule_classify(self, message: str) -> ComplexityResult | None:
        """
        规则引擎判定

        Returns:
            ComplexityResult 或 None（无法判定时）
        """
        if not message or not message.strip():
            return ComplexityResult(
                level="complex",
                confidence=0.8,
                reason="空消息",
                method="rule"
            )

        # 检查复杂模式
        for pattern in COMPLEX_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return ComplexityResult(
                    level="complex",
                    confidence=0.95,
                    reason=f"匹配复杂模式: {pattern}",
                    method="rule"
                )

        # 检查跨部门关键词数量
        dept_count = sum(1 for kw in CROSS_DEPT_KEYWORDS if kw in message)
        if dept_count >= 2:
            return ComplexityResult(
                level="complex",
                confidence=0.9,
                reason=f"包含{dept_count}个跨部门关键词",
                method="rule"
            )

        # 检查动词数量
        verb_count = sum(1 for verb in VERBS if verb in message)
        if verb_count >= 3:
            return ComplexityResult(
                level="complex",
                confidence=0.85,
                reason=f"包含{verb_count}个动词",
                method="rule"
            )

        # 检查简单模式
        for pattern in SIMPLE_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                # 简单模式匹配，但需要确保没有复杂特征
                if verb_count <= 1 and dept_count == 0:
                    return ComplexityResult(
                        level="simple",
                        confidence=0.9,
                        reason=f"匹配简单模式: {pattern}",
                        method="rule"
                    )

        # 无法判定
        return None

    async def _kernel_classify(self, message: str) -> ComplexityResult | None:
        """
        使用 agent-kernel 的 agent_decide 进行复杂度分类。

        Kernel 返回的 action 映射：
        - execute → simple（可直接执行）
        - delegate → complex（需要多人协作）
        - reflect/requestInfo → complex（需要更多分析）
        - decline → complex（任务不可行）

        Returns:
            ComplexityResult 或 None（kernel 不可用时）
        """
        entity_id = await self._ensure_classifier_entity()
        if entity_id is None:
            return None

        task = (
            f"请判断以下任务的复杂度。"
            f"如果这是一个简单任务（单步操作、单人即可完成），请选择 execute。"
            f"如果这是一个复杂任务（多步骤、需要多人协作、跨领域），请选择 delegate。\n\n"
            f"任务：{message}"
        )

        try:
            decision = self._kernel.agent_decide("ceo-classifier", task)
            if not decision:
                return None

            action = decision.get("action", "")
            confidence = float(decision.get("confidence", 0.5))
            reasoning = decision.get("reasoning", "")

            # Map kernel action to complexity level
            if action == "execute":
                level = "simple"
            elif action in ("delegate", "decline"):
                level = "complex"
            elif action == "reflect":
                level = "complex"
                confidence = max(confidence, 0.6)  # reflect 暗示不确定 → 倾向复杂
            elif action == "requestInfo":
                level = "complex"
                confidence = max(confidence, 0.55)
            else:
                return None  # 未知 action，降级到 LLM

            return ComplexityResult(
                level=level,
                confidence=min(confidence, 0.99),
                reason=f"Kernel 决策: {action} — {reasoning[:100]}",
                method="kernel",
            )
        except Exception as e:
            logger.debug("Kernel 分类失败: %s", e)
            return None

    async def _llm_classify(self, message: str) -> ComplexityResult:
        """
        LLM 语义分析分类

        Returns:
            ComplexityResult
        """
        if not self._get_model:
            raise ValueError("未配置 LLM 模型")

        model = self._get_model("ceo")
        prompt = (
            f"请分析以下用户消息的任务复杂度，判断应该走简单路径还是复杂路径。\n\n"
            f"用户消息：{message}\n\n"
            f"判断标准：\n"
            f"- 简单路径：单步操作（如打开网页、搜索、点击、截图、读写文件）\n"
            f"- 复杂路径：多步骤任务、跨部门协作、需要设计/开发/测试/部署等多环节\n\n"
            f"请严格以 JSON 格式返回，不要包含其他内容：\n"
            f'{{"level": "simple" 或 "complex", "confidence": 0.0-1.0, "reason": "判断理由"}}'
        )

        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

        try:
            response = await model.reply(msg)
        except Exception as e:
            logger.warning("LLM 调用失败: %s", e)
            # 返回默认结果
            return ComplexityResult(
                level="complex",
                confidence=0.5,
                reason=f"LLM 调用失败，降级到复杂路径: {str(e)[:50]}",
                method="fallback"
            )

        text = _extract_text(response)

        # 解析 JSON
        json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return ComplexityResult(
                    level=str(data.get("level", "complex")),
                    confidence=float(data.get("confidence", 0.5)),
                    reason=str(data.get("reason", "LLM 分析")),
                    method="llm"
                )
            except (json.JSONDecodeError, TypeError, KeyError):
                pass

        # JSON 解析失败，根据文本内容推断
        if '简单' in text or 'simple' in text.lower():
            return ComplexityResult(
                level="simple",
                confidence=0.6,
                reason=f"LLM 推断为简单任务: {text[:100]}",
                method="llm"
            )
        else:
            return ComplexityResult(
                level="complex",
                confidence=0.6,
                reason=f"LLM 推断为复杂任务: {text[:100]}",
                method="llm"
            )
