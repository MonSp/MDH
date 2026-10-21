"""M2.5 Skill→ProgramCompiler unit tests (injected generate, no network)."""

from __future__ import annotations

import json

import pytest
from program_compiler import GenerationError
from program_registry import ProgramRegistry
from skill_to_program import (
    compile_skill_to_program,
    is_deterministic_step,
    load_skill_material,
    skill_to_trajectory,
)


def _write_skill_pack(base, name="demo_skill"):
    import os

    pack = os.path.join(base, name)
    os.makedirs(os.path.join(pack, "rules"), exist_ok=True)
    with open(os.path.join(pack, "manifest.yaml"), "w") as f:
        f.write(
            f"name: {name}\n"
            'version: "1.0.0"\n'
            "description: 演示技能，含确定性检查\n"
            "category: dev\n"
            "methodology: 校验 JSON 输出格式\n"
            "trigger: JSON校验, 格式检查\n"
        )
    with open(os.path.join(pack, "SKILL.md"), "w") as f:
        f.write(
            "---\n"
            f"name: {name}\n"
            "trigger: JSON校验, 格式检查\n"
            "---\n\n"
            "# Demo\n\n"
            "- 必须校验 JSON 输出可被 json.loads 解析\n"
            "- 建议采用事件驱动架构（品味类，应丢弃）\n"
        )
    with open(os.path.join(pack, "rules", "r1.yaml"), "w") as f:
        f.write(
            "trigger_condition: when validating json\n"
            "action: 必须检查顶层为 object 且含 ok 字段\n"
            "rule_type: success_pattern\n"
        )
    with open(os.path.join(pack, "rules", "r2.yaml"), "w") as f:
        f.write(
            "trigger_condition: style\n"
            "action: 建议采用事件驱动架构，保持优雅\n"
            "rule_type: correction_tip\n"
        )
    return pack


def test_is_deterministic_step():
    assert is_deterministic_step("必须校验 JSON 输出可解析")
    assert is_deterministic_step("禁止字符串拼接 SQL，使用参数化查询")
    assert not is_deterministic_step("建议采用事件驱动架构，保持优雅")
    assert not is_deterministic_step("")


def test_load_skill_material_filters_semantic(tmp_path):
    _write_skill_pack(str(tmp_path))
    mat = load_skill_material("demo_skill", str(tmp_path))
    assert mat.name == "demo_skill"
    assert any("json.loads" in s or "ok 字段" in s for s in mat.deterministic_steps)
    assert not any("事件驱动" in s for s in mat.deterministic_steps)
    assert any("事件驱动" in s for s in mat.dropped_semantic)
    assert "JSON校验" in mat.trigger_hints or "格式检查" in mat.trigger_hints


def test_skill_to_trajectory_marks_source(tmp_path):
    _write_skill_pack(str(tmp_path))
    mat = load_skill_material("demo_skill", str(tmp_path))
    traj = skill_to_trajectory(mat)
    assert traj.success is True
    assert traj.source_skill == "demo_skill"
    assert traj.steps
    assert "demo_skill" in traj.task_description


def test_compile_skill_to_program(tmp_path):
    _write_skill_pack(str(tmp_path))
    reg = ProgramRegistry(str(tmp_path / "packs"))

    async def fake_generate(prompt: str) -> str:
        assert "demo_skill" in prompt or "确定性" in prompt
        draft = {
            "program_id": "skill_demo_skill",
            "version": "1.0.0",
            "description": "from skill",
            "trigger_keywords": ["JSON校验", "格式检查"],
            "io_schema": {
                "inputs": {"task": {"type": "string", "required": True}},
                "outputs": {"description": "ok flag"},
            },
            "main_py": (
                "import json\n"
                "def run(data):\n"
                "    return {'ok': True, 'task': data.get('task', '')}\n"
                "if __name__ == '__main__':\n"
                "    json.dump(run(json.load(sys.stdin)), sys.stdout)\n"
                "import sys\n"
            ),
            "test_py": "import main\n\ndef test_run():\n    assert main.run({'task': 'x'})['ok']\n",
        }
        return json.dumps(draft)

    import asyncio

    m = asyncio.run(
        compile_skill_to_program(
            "demo_skill", reg, fake_generate, skill_packs_dir=str(tmp_path)
        )
    )
    assert m.program_id == "skill_demo_skill"
    assert m.status.value == "candidate" or m.status == "candidate"
    pack = reg.pack_dir(m.program_id)
    import os

    assert os.path.isfile(os.path.join(pack, "main.py"))
    assert os.path.isfile(os.path.join(pack, "tests", "test_generated.py"))


def test_compile_skill_no_deterministic_raises(tmp_path):
    pack = tmp_path / "empty_skill"
    pack.mkdir()
    (pack / "manifest.yaml").write_text(
        "name: empty_skill\nversion: '1.0.0'\ndescription: x\n", encoding="utf-8"
    )
    (pack / "SKILL.md").write_text(
        "---\nname: empty_skill\n---\n\n只有品味建议，没有确定性步骤\n",
        encoding="utf-8",
    )
    reg = ProgramRegistry(str(tmp_path / "packs"))

    async def fake_generate(prompt: str) -> str:
        return "{}"

    with pytest.raises((ValueError, GenerationError)):
        import asyncio

        asyncio.run(
            compile_skill_to_program(
                "empty_skill", reg, fake_generate, skill_packs_dir=str(tmp_path)
            )
        )


def test_compile_skill_missing_pack(tmp_path):
    reg = ProgramRegistry(str(tmp_path / "packs"))

    async def fake_generate(prompt: str) -> str:
        return "{}"

    with pytest.raises(FileNotFoundError):
        import asyncio

        asyncio.run(
            compile_skill_to_program(
                "nope", reg, fake_generate, skill_packs_dir=str(tmp_path)
            )
        )
