"""
SkillGenerator — AI 技能生成服务

从 server.py generate_skill 端点提取的 LLM 编排逻辑。
负责根据用户需求描述生成技能配置。
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger("skill_generator")


class SkillGenerator:
    """AI 技能生成器

    职责：
    - 构建技能生成 prompt
    - 调用 LLM 生成技能配置
    - 解析和验证 JSON 输出
    """

    def __init__(self, load_roles_config_fn=None):
        self._load_roles_config = load_roles_config_fn

    async def generate(
        self,
        description: str,
        provider: str = "deepseek",
        api_key: str = "",
        base_url: str = "",
        model_name: str = "",
    ) -> dict[str, Any]:
        """生成技能配置

        Args:
            description: 技能需求描述
            provider: 模型提供商
            api_key: API 密钥
            base_url: API 基础 URL
            model_name: 模型名称

        Returns:
            {"success": True, "data": skill_config} 或 {"success": False, "error": str}
        """
        if not description.strip():
            return {"success": False, "error": "请提供技能需求描述"}

        if not api_key:
            return {"success": False, "error": "未配置API密钥"}

        try:
            # 创建模型
            from chat_agent import ChatAgent as Agent
            from chat_agent import Msg

            from agent import _extract_text
            from model_factory import create_agent, get_default_base_url

            if base_url and not base_url.startswith(("http://", "https://")):
                base_url = "https://" + base_url
            if not base_url:
                base_url = get_default_base_url(provider)

            agent = create_agent(
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model_name=model_name,
                system_prompt="你是一位AI技能设计专家。",
                agent_name="skill-generator",
                stream=False,
            )
            model = agent.model

            # 构建 prompt
            prompt = self._build_prompt(description)

            # 调用 LLM
            llm_agent = Agent(
                name="skill_generator",
                system_prompt="你是一位AI Harness Engineering技能设计专家。请严格按照JSON格式返回结果。",
                model=model,
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await llm_agent.reply(msg)
            text = _extract_text(response)

            # 解析 JSON
            skill_config = self._parse_response(text)
            if "error" in skill_config:
                return {"success": False, "error": skill_config["error"]}

            return {"success": True, "data": skill_config}

        except Exception as e:
            logger.exception("AI生成技能失败")
            return {"success": False, "error": str(e)}

    def _build_prompt(self, description: str) -> str:
        """构建技能生成 prompt"""
        existing_skills = []
        if self._load_roles_config:
            try:
                config = self._load_roles_config()
                existing_skills = list((config or {}).get("skills", {}).keys())
            except Exception as e:
                logger.debug("加载角色配置失败: %s", e)

        existing_list = ", ".join(existing_skills[:20]) if existing_skills else "无"

        return f"""你是一位AI Harness Engineering技能设计专家。请根据以下需求描述，生成一个完整的技能配置。

用户需求：{description}

当前已有的技能ID（请避免重复）：{existing_list}

请严格按以下JSON格式返回，不要包含其他内容：
{{
    "id": "技能ID（英文snake_case，简短有意义）",
    "name": "技能中文名称",
    "description": "一句话描述（20字以内）",
    "category": "分类（dev/testing/ops/data/ai/ux/design/content/sales/general 选一）",
    "methodology": "方法论描述（用 — 连接方法名和简要说明）",
    "practices": [
        "最佳实践1（具体可执行，含量化指标）",
        "最佳实践2",
        "最佳实践3",
        "最佳实践4",
        "最佳实践5",
        "最佳实践6"
    ],
    "workflow": {{
        "1": "第一步",
        "2": "第二步",
        "3": "第三步",
        "4": "第四步",
        "5": "第五步",
        "6": "第六步"
    }},
    "required_tools": ["工具列表，从以下选择：read_file, write_file, edit_file, list_directory, bash, git_status, git_commit, git_push, git_branch, git_diff, git_log, search_files, grep_content, run_tests, run_linter, create_document, edit_document, create_slide, edit_slide, run_sql, create_chart, run_etl, generate_image, generate_video, edit_media, write_copy, seo_optimize, web_fetch"]
}}"""

    def _parse_response(self, text: str) -> dict[str, Any]:
        """解析 LLM 返回的 JSON"""
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            return {"error": f"AI未能生成有效配置，返回内容: {text[:200]}"}

        try:
            skill_config = json.loads(json_match.group())
        except json.JSONDecodeError as e:
            return {"error": f"JSON解析失败: {e!s}"}

        # 验证必要字段
        if not skill_config.get("id"):
            return {"error": "AI未生成技能ID"}
        if not skill_config.get("name"):
            skill_config["name"] = skill_config["id"]

        return skill_config
