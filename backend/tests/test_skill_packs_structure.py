import os
import yaml

SKILL_PACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "skill_packs")
REQUIRED_MANIFEST_FIELDS = {"name", "version", "description", "category"}


def _get_skill_dirs():
    if not os.path.isdir(SKILL_PACKS_DIR):
        return []
    return [d for d in os.listdir(SKILL_PACKS_DIR) if os.path.isdir(os.path.join(SKILL_PACKS_DIR, d))]


def test_skill_packs_dir_exists():
    assert os.path.isdir(SKILL_PACKS_DIR)


def test_each_skill_has_manifest():
    for skill_dir in _get_skill_dirs():
        manifest_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "manifest.yaml")
        assert os.path.isfile(manifest_path), f"{skill_dir} 缺少 manifest.yaml"


def test_manifest_has_required_fields():
    for skill_dir in _get_skill_dirs():
        manifest_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "manifest.yaml")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = yaml.safe_load(f)
        missing = REQUIRED_MANIFEST_FIELDS - set(manifest.keys())
        assert not missing, f"{skill_dir} manifest 缺少字段: {missing}"


def test_each_skill_has_system_prompt():
    for skill_dir in _get_skill_dirs():
        prompt_path = os.path.join(SKILL_PACKS_DIR, skill_dir, "system_prompt.md")
        assert os.path.isfile(prompt_path)


def test_at_least_5_skills():
    skills = _get_skill_dirs()
    assert len(skills) >= 5
