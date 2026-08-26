"""
Critic Agent - 伴随式审查角色

自动发现任务上下文中的漏洞、被忽略的需求域、矛盾约束。
每次审查结果写入 companion_log.json。
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
import logging
import os
import re

from agentscope.message import Msg
from protocol import AgentRole
from agent import _extract_text

logger = logging.getLogger("critic_agent")


@dataclass
class CriticResult:
    """Critic审查结果"""
    findings: List[str]
    severity: str  # "low" | "medium" | "high" | "critical"
    timestamp: str
    stage: str
    details: Optional[Dict[str, Any]] = None


class CriticAgent:
    """
    伴随式审查角色 - Critic

    职责：
    1. 发现被忽略的需求域
    2. 发现互相矛盾的约束
    3. 发现证据不足的结论
    4. 发现潜在的风险点

    按需触发，不常驻。
    """

    def __init__(self, companion_log_path: Optional[str] = None):
        """
        Args:
            companion_log_path: companion_log.json 文件路径
        """
        self._companion_log_path = companion_log_path or "companion_log.json"
        self._log_entries: List[Dict[str, Any]] = []

    def review(self, task_context: Dict[str, Any], stage: str = "clarification") -> CriticResult:
        """
        审查任务上下文

        Args:
            task_context: 任务上下文，包含：
                - task_description: 任务描述
                - requirements: 需求列表
                - constraints: 约束列表
                - assumptions: 假设列表
                - spec_tree: 规格树（可选）
            stage: 审查阶段（input/clarification/planning/execution/review）

        Returns:
            CriticResult: 审查结果
        """
        findings = []

        # 1. 检查需求完整性
        findings.extend(self._check_requirements(task_context))

        # 2. 检查约束一致性
        findings.extend(self._check_constraints(task_context))

        # 3. 检查证据充分性
        findings.extend(self._check_evidence(task_context))

        # 4. 检查潜在风险
        findings.extend(self._check_risks(task_context))

        # 确定严重程度
        severity = self._determine_severity(findings)

        result = CriticResult(
            findings=findings,
            severity=severity,
            timestamp=datetime.now().isoformat(),
            stage=stage,
        )

        # 写入companion_log
        self._write_to_log(result)

        return result

    async def review_with_llm(
        self,
        task_context: Dict[str, Any],
        get_model_fn,
        stage: str = "review",
    ) -> CriticResult:
        """规则审查 + LLM 补充审查（LLM 失败时回退纯规则）"""
        rule_result = self.review(task_context, stage=stage)

        try:
            model = get_model_fn(AgentRole.REVIEWER)
        except Exception as e:
            logger.warning("Critic 获取模型失败: %s", e)
            return rule_result

        prompt = (
            "你是审查智能体（Critic）。请审查以下任务上下文，找出漏洞、被忽略的需求域、"
            "矛盾约束与风险。\n"
            f"任务上下文：{json.dumps(task_context, ensure_ascii=False)}\n\n"
            '请以 JSON 数组返回发现，每项为 {"finding": "...", "severity": "low|medium|high|critical"}。'
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

        try:
            response = await model.reply(msg)
            text = _extract_text(response)
            llm_findings = self._parse_llm_findings(text)
        except Exception as e:
            logger.warning("Critic LLM 审查失败: %s", e)
            return rule_result

        merged = CriticResult(
            findings=rule_result.findings + [f["finding"] for f in llm_findings],
            severity=self._merge_severity(rule_result.severity, llm_findings),
            timestamp=datetime.now().isoformat(),
            stage=stage,
            details={
                "llm_findings": llm_findings,
                "rule_findings": rule_result.findings,
            },
        )
        return merged

    @staticmethod
    def _parse_llm_findings(text: str) -> List[Dict[str, str]]:
        """解析 LLM 返回的 JSON 数组，容错提取（首个可解析且含 findings 的数组）"""
        findings: List[Dict[str, str]] = []
        for match in re.finditer(r'\[[^\]]*\]', text):
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                continue
            if not isinstance(parsed, list):
                continue
            for item in parsed:
                if isinstance(item, dict) and item.get("finding"):
                    findings.append({
                        "finding": str(item["finding"]),
                        "severity": CriticAgent._normalize_severity(item.get("severity", "medium")),
                    })
            if findings:
                break  # 只取首个含 findings 的可解析数组
        return findings

    @staticmethod
    def _normalize_severity(severity: Any) -> str:
        """归一化 severity：小写、去空白与标点，仅保留字母；未知/空值回落 medium"""
        normalized = re.sub(r'[^a-z]', '', str(severity).lower())
        return normalized if normalized in {"low", "medium", "high", "critical"} else "medium"

    @staticmethod
    def _merge_severity(rule_severity: str, llm_findings: List[Dict[str, str]]) -> str:
        """合并严重程度：取最严重值"""
        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        current = order.get(rule_severity, 1)
        for f in llm_findings:
            sev = CriticAgent._normalize_severity(f.get("severity", "medium"))
            rank = order[sev]
            if rank > current:
                current = rank
        return next(k for k, v in order.items() if v == current)

    def _check_requirements(self, context: Dict[str, Any]) -> List[str]:
        """检查需求完整性"""
        findings = []

        requirements = context.get("requirements", [])
        if not requirements:
            findings.append("未发现明确的需求列表，可能导致目标不清晰")

        # 检查是否有成功标准
        success_criteria = context.get("success_criteria", [])
        if not success_criteria:
            findings.append("未定义成功标准，无法度量任务完成度")

        # 检查需求是否有验收标准
        for req in requirements:
            if isinstance(req, dict) and not req.get("acceptance"):
                findings.append(f"需求 '{req.get('title', 'unknown')}' 缺少验收标准")

        return findings

    def _check_constraints(self, context: Dict[str, Any]) -> List[str]:
        """检查约束一致性"""
        findings = []

        constraints = context.get("constraints", [])
        if len(constraints) > 5:
            findings.append(f"约束数量较多（{len(constraints)}条），可能存在互相矛盾的风险")

        # 检查是否有时间约束和资源约束的冲突
        has_time_constraint = any("时间" in str(c) or "deadline" in str(c).lower() for c in constraints)
        has_resource_constraint = any("资源" in str(c) or "预算" in str(c) for c in constraints)

        if has_time_constraint and has_resource_constraint:
            findings.append("同时存在时间和资源约束，需要评估可行性")

        return findings

    def _check_evidence(self, context: Dict[str, Any]) -> List[str]:
        """检查证据充分性"""
        findings = []

        assumptions = context.get("assumptions", [])
        if assumptions:
            findings.append(f"存在{len(assumptions)}个未验证的假设，需要补充证据")

        # 检查是否有代码证据
        has_code_evidence = any(
            "repo://" in str(e) or "file://" in str(e)
            for e in context.get("evidence", [])
        )

        if not has_code_evidence and context.get("repo_available", False):
            findings.append("仓库可用但未引用代码证据，建议补充具体的代码引用")

        return findings

    def _check_risks(self, context: Dict[str, Any]) -> List[str]:
        """检查潜在风险"""
        findings = []

        task_desc = context.get("task_description", "")

        # 检查高风险关键词
        high_risk_keywords = ["重构", "迁移", "删除", "替换", "重写", "refactor", "migrate", "replace"]
        for keyword in high_risk_keywords:
            if keyword in task_desc.lower():
                findings.append(f"任务涉及高风险操作（{keyword}），建议制定回滚方案")
                break

        # 检查依赖风险
        dependencies = context.get("dependencies", [])
        if len(dependencies) > 3:
            findings.append(f"依赖项较多（{len(dependencies)}个），存在级联失败风险")

        return findings

    def _determine_severity(self, findings: List[str]) -> str:
        """根据findings确定严重程度"""
        if not findings:
            return "low"

        critical_keywords = ["矛盾", "冲突", "缺失", "cascade", "级联"]
        high_keywords = ["高风险", "未验证", "缺少"]

        for finding in findings:
            for keyword in critical_keywords:
                if keyword in finding:
                    return "critical"

        for finding in findings:
            for keyword in high_keywords:
                if keyword in finding:
                    return "high"

        if len(findings) > 3:
            return "medium"

        return "low"

    def _write_to_log(self, result: CriticResult):
        """写入companion_log.json"""
        entry = {
            "stage": result.stage,
            "role": "critic",
            "ts": result.timestamp,
            "findings": result.findings,
            "severity": result.severity,
        }

        self._log_entries.append(entry)

        # 尝试持久化
        try:
            # 读取现有日志
            existing = []
            if os.path.exists(self._companion_log_path):
                with open(self._companion_log_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)

            # 追加新条目
            existing.append(entry)

            # 写入文件
            os.makedirs(os.path.dirname(self._companion_log_path) if os.path.dirname(self._companion_log_path) else '.', exist_ok=True)
            with open(self._companion_log_path, 'w', encoding='utf-8') as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
        except Exception:
            # 日志写入失败不影响主流程
            pass

    def get_log_entries(self) -> List[Dict[str, Any]]:
        """获取内存中的日志条目"""
        return self._log_entries.copy()


if __name__ == "__main__":
    # 测试
    agent = CriticAgent()

    # 测试用例1：缺少需求
    result = agent.review({
        "task_description": "重构登录模块",
        "requirements": [],
        "constraints": ["时间紧迫"],
    }, stage="clarification")

    print("测试1：缺少需求")
    print(f"  严重程度：{result.severity}")
    print(f"  发现问题：{len(result.findings)} 个")
    for f in result.findings:
        print(f"    - {f}")

    # 测试用例2：完整上下文
    result = agent.review({
        "task_description": "添加用户注册功能",
        "requirements": [
            {"title": "注册表单", "acceptance": "WHEN 用户填写表单 THEN 系统 SHALL 验证"},
            {"title": "邮件验证", "acceptance": "WHEN 用户提交 THEN 系统 SHALL 发送邮件"},
        ],
        "constraints": ["必须支持中文"],
        "success_criteria": ["sc1: 注册成功率>95%"],
        "evidence": ["repo://src/auth/register.py"],
        "repo_available": True,
    }, stage="planning")

    print("\n测试2：完整上下文")
    print(f"  严重程度：{result.severity}")
    print(f"  发现问题：{len(result.findings)} 个")
    for f in result.findings:
        print(f"    - {f}")
