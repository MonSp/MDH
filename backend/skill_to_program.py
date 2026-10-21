"""M2.5: Skill → ProgramCompiler — 技能包确定性步骤固化为 ProgramPack。

SIGIL/SkillSmith 式融合：不整包翻译 Skill，只抽取**可单测的确定性步骤**
（检查清单/生成规则/格式约束），经现有 ProgramCompiler.compile 产出
candidate（status=candidate，仍需 PromotionGate 才能路由）。

语义判断步骤（建议/架构/品味类）在此丢弃——由 LLM 路径继续承载。
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from program_compiler import (
    GenerateFn,
    ProgramCompiler,
    TaskTrajectory,
)
from program_registry import ProgramManifest, ProgramRegistry

logger = logging.getLogger(__name__)

# 确定性步骤启发式：出现这些信号更可能是可固化检查/生成规则
_DETERMINISTIC_HINTS = (
    "必须",
    "禁止",
    "应当",
    "需要",
    "检查",
    "校验",
    "验证",
    "测试",
    "覆盖",
    "格式",
    "JSON",
    "UTF-8",
    "utf-8",
    "文件",
    "路径",
    "命名",
    "snake",
    "参数化",
    "转义",
    "清理",
    "删除临时",
    "输出",
    "返回",
    "断言",
    "assert",
    "pytest",
    "lint",
    "排序",
    "去重",
    "上限",
    "超时",
    "编码",
)

# 明确偏语义/品味的信号 → 丢弃
_SEMANTIC_ONLY_HINTS = (
    "建议采用",
    "考虑使用",
    "品味",
    "优雅",
    "最好",
    "尽量",
    "可能需要结合",
    "视情况",
    "领域驱动",
    "架构风格",
)


@dataclass
class SkillMaterial:
    """从 skill_packs/<name>/ 抽取的可编译素材。"""

    name: str
    description: str = ""
    methodology: str = ""
    category: str = ""
    deterministic_steps: list[str] = field(default_factory=list)
    dropped_semantic: list[str] = field(default_factory=list)
    trigger_hints: list[str] = field(default_factory=list)


def _default_skill_packs_dir() -> str:
    here = Path(__file__).resolve().parent
    return str(here.parent / "skill_packs")


def is_deterministic_step(text: str) -> bool:
    """启发式：步骤文本是否偏确定性可测逻辑。"""
    if not text or not text.strip():
        return False
    t = text.strip()
    if any(h in t for h in _SEMANTIC_ONLY_HINTS) and not any(
        h in t for h in ("必须", "禁止", "校验", "测试")
    ):
        return False
    return any(h in t for h in _DETERMINISTIC_HINTS)


def _steps_from_rules(rules_dir: str) -> tuple[list[str], list[str]]:
    det: list[str] = []
    semantic: list[str] = []
    if not os.path.isdir(rules_dir):
        return det, semantic
    for fname in sorted(os.listdir(rules_dir)):
        if not fname.endswith((".yaml", ".yml", ".md", ".txt")):
            continue
        path = os.path.join(rules_dir, fname)
        try:
            raw = Path(path).read_text(encoding="utf-8")
        except OSError:
            continue
        texts: list[str] = []
        if fname.endswith((".yaml", ".yml")):
            try:
                data = yaml.safe_load(raw)
            except yaml.YAMLError:
                data = None
            if isinstance(data, dict):
                action = data.get("action") or data.get("note") or ""
                trigger = data.get("trigger_condition") or ""
                if action:
                    texts.append(f"{trigger} → {action}" if trigger else str(action))
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        a = item.get("action") or ""
                        if a:
                            texts.append(str(a))
        else:
            for line in raw.splitlines():
                line = line.strip().lstrip("-*").strip()
                if len(line) >= 8:
                    texts.append(line)
        for t in texts:
            if is_deterministic_step(t):
                det.append(t[:500])
            else:
                semantic.append(t[:500])
    return det, semantic


def load_skill_material(
    skill_name: str, skill_packs_dir: str | None = None
) -> SkillMaterial:
    """读取 skill_packs/<name>，抽取确定性步骤。"""
    base = skill_packs_dir or _default_skill_packs_dir()
    pack = os.path.join(base, skill_name)
    if not os.path.isdir(pack):
        raise FileNotFoundError(f"skill pack not found: {skill_name}")

    mat = SkillMaterial(name=skill_name)
    manifest_path = os.path.join(pack, "manifest.yaml")
    if os.path.isfile(manifest_path):
        try:
            mf = yaml.safe_load(Path(manifest_path).read_text(encoding="utf-8")) or {}
        except yaml.YAMLError:
            mf = {}
        if isinstance(mf, dict):
            mat.description = str(mf.get("description") or "")
            mat.methodology = str(mf.get("methodology") or "")
            mat.category = str(mf.get("category") or "")
            trig = mf.get("trigger") or mf.get("description") or ""
            if isinstance(trig, str) and trig:
                mat.trigger_hints = [p.strip() for p in re.split(r"[,，、/]", trig) if p.strip()][:6]

    skill_md = os.path.join(pack, "SKILL.md")
    if os.path.isfile(skill_md):
        try:
            body = Path(skill_md).read_text(encoding="utf-8")
        except OSError:
            body = ""
        # frontmatter trigger
        for line in body.splitlines()[:30]:
            if line.lower().startswith("trigger:"):
                trig = line.split(":", 1)[1].strip()
                if trig and not mat.trigger_hints:
                    mat.trigger_hints = [
                        p.strip() for p in re.split(r"[,，、]", trig) if p.strip()
                    ][:6]
        # body bullet lines as additional steps (skip YAML frontmatter)
        past_front = False
        fm_count = 0
        for line in body.splitlines():
            if line.strip() == "---":
                fm_count += 1
                if fm_count >= 2:
                    past_front = True
                continue
            if not past_front:
                continue
            if line.startswith("#"):
                continue
            s = line.strip().lstrip("-*").strip()
            if len(s) >= 10 and is_deterministic_step(s):
                mat.deterministic_steps.append(s[:500])

    det_rules, sem_rules = _steps_from_rules(os.path.join(pack, "rules"))
    for s in det_rules:
        if s not in mat.deterministic_steps:
            mat.deterministic_steps.append(s)
    mat.dropped_semantic.extend(sem_rules[:20])

    # 去重保序
    seen: set[str] = set()
    uniq: list[str] = []
    for s in mat.deterministic_steps:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    mat.deterministic_steps = uniq[:30]
    return mat


def skill_to_trajectory(material: SkillMaterial) -> TaskTrajectory:
    """确定性步骤 → ProgramCompiler 轨迹输入。"""
    desc = (
        f"执行技能包「{material.name}」中的确定性检查/生成流程。"
        f"{material.methodology or material.description}"
    )
    return TaskTrajectory(
        task_description=desc[:2000],
        steps=material.deterministic_steps,
        input_example={
            "skill": material.name,
            "category": material.category,
            "deterministic_step_count": len(material.deterministic_steps),
        },
        output_example={"applied_checks": ["..."], "ok": True},
        success=True,
        source_skill=material.name,
    )


async def compile_skill_to_program(
    skill_name: str,
    registry: ProgramRegistry,
    generate: GenerateFn,
    *,
    skill_packs_dir: str | None = None,
) -> ProgramManifest:
    """技能包 → candidate ProgramPack（不自动晋升）。

    无足够确定性步骤 → ValueError（调用方应跳过而非空编译）。
    """
    material = load_skill_material(skill_name, skill_packs_dir)
    if len(material.deterministic_steps) < 1:
        raise ValueError(
            f"skill {skill_name!r} has no deterministic steps eligible for compilation"
        )
    trajectory = skill_to_trajectory(material)
    compiler = ProgramCompiler(registry)
    manifest = await compiler.compile(trajectory, generate)
    logger.info(
        "M2.5 compiled skill %s → program %s (%d deterministic steps, %d semantic dropped)",
        skill_name,
        manifest.program_id,
        len(material.deterministic_steps),
        len(material.dropped_semantic),
    )
    return manifest
