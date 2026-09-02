import json
import logging
import os

from config import SKILL_MD_TEMPLATE, SKILLS_DIR

logger = logging.getLogger("skills")

SUMMARY_PROMPT_STRICT = """你是一个浏览器自动化技能总结助手。根据以下执行步骤，生成简洁的技能名称和描述。
这是一个「严格步骤型」技能，步骤会精确记录目标网页、元素选择器、输入内容等细节，执行时严格按步骤复现。

执行步骤：
{steps_text}

请严格以 JSON 格式返回，不要包含其他内容：
{{"name": "技能名称（4-10个字，概括具体操作）", "description": "一句话描述这个技能的用途，体现具体操作对象（15-30个字）"}}"""

SUMMARY_PROMPT_GENERAL = """你是一个浏览器自动化技能总结助手。根据以下执行步骤，生成简洁的技能名称和描述。
这是一个「泛化决策型」技能，执行时 AI 会根据当前情况自主决策具体操作，步骤只作为高层意图参考。

执行步骤：
{steps_text}

请严格以 JSON 格式返回，不要包含其他内容：
{{"name": "技能名称（4-10个字，概括任务目标而非具体操作）", "description": "一句话描述这个技能的目标，强调结果而非过程（15-30个字）"}}"""


def _build_steps_text(steps: list[dict]) -> str:
    lines = []
    for i, step in enumerate(steps, 1):
        cmd = step.get("command", "")
        payload = step.get("payload", {})
        if payload:
            args = ", ".join(f"{k}={v}" for k, v in payload.items())
            lines.append(f"{i}. {cmd}({args})")
        else:
            lines.append(f"{i}. {cmd}")
    return "\n".join(lines)


async def generate_skill_summary(session, steps: list[dict], skill_type: str = "strict") -> dict:
    from agent import PROVIDER_REGISTRY

    provider = session.provider or "deepseek"
    reg = PROVIDER_REGISTRY.get(provider)
    if reg is None:
        return {"name": "", "description": "", "error": f"不支持的提供商: {provider}"}

    try:
        credential = reg["credential_cls"](**reg["credential_kwargs"](session))
        model = reg["model_cls"](
            credential=credential,
            model=session.model_name or reg["default_model"],
            stream=False,
            formatter=reg["formatter_cls"](),
        )

        from agentscope.message import Msg
        steps_text = _build_steps_text(steps)
        prompt_tpl = SUMMARY_PROMPT_STRICT if skill_type == "strict" else SUMMARY_PROMPT_GENERAL
        prompt = prompt_tpl.format(steps_text=steps_text)
        user_msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

        response = await model([user_msg])

        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            text = text.strip()

        result = json.loads(text)
        name = result.get("name", "")
        desc = result.get("description", "")
        logger.info("LLM 生成摘要: name=%s desc=%s", name, desc)
        return {"name": name, "description": desc}

    except Exception as e:
        logger.warning("LLM 摘要生成失败: %s", e)
        return {"name": "", "description": "", "error": str(e)}


def list_skills_from_dir() -> list[dict]:
    if not os.path.isdir(SKILLS_DIR):
        return []
    result = []
    for entry in os.listdir(SKILLS_DIR):
        skill_dir = os.path.join(SKILLS_DIR, entry)
        md_path = os.path.join(skill_dir, "SKILL.md")
        if os.path.isdir(skill_dir) and os.path.isfile(md_path):
            try:
                import frontmatter
                with open(md_path, encoding="utf-8") as f:
                    fm = frontmatter.load(f)
                result.append({
                    "name": fm.get("name", entry),
                    "description": fm.get("description", ""),
                    "type": fm.get("type", "strict"),
                    "dir": entry,
                })
            except Exception:
                pass
    return result


def save_skill_to_dir(name: str, description: str, steps: list[dict], skill_type: str = "strict") -> str:
    safe_name = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)
    skill_dir = os.path.join(SKILLS_DIR, safe_name)
    os.makedirs(skill_dir, exist_ok=True)

    steps_lines = []
    for i, step in enumerate(steps, 1):
        cmd = step.get("command", "")
        payload = step.get("payload", {})
        payload_str = ", ".join(f"{k}={v}" for k, v in payload.items())
        steps_lines.append(f"{i}. 调用 `{cmd}` 工具: {payload_str}")

    params = []
    for step in steps:
        for k, v in step.get("payload", {}).items():
            if isinstance(v, str) and len(v) > 1:
                params.append(f"- {k}: {v}")

    type_label = "严格步骤（精确复现）" if skill_type == "strict" else "泛化决策（AI 自主）"
    content = SKILL_MD_TEMPLATE.format(
        name=name,
        description=description,
        skill_type=skill_type,
        type_label=type_label,
        steps_section="\n".join(steps_lines),
        params_section="\n".join(params) if params else "无",
    )

    md_path = os.path.join(skill_dir, "SKILL.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    return safe_name
