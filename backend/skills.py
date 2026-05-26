import os

from config import SKILLS_DIR, SKILL_MD_TEMPLATE


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
                    "dir": entry,
                })
            except Exception:
                pass
    return result


def save_skill_to_dir(name: str, description: str, steps: list[dict]) -> str:
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

    content = SKILL_MD_TEMPLATE.format(
        name=name,
        description=description,
        steps_section="\n".join(steps_lines),
        params_section="\n".join(params) if params else "无",
    )

    md_path = os.path.join(skill_dir, "SKILL.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    return safe_name
