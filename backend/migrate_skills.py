"""
migrate_skills.py — 批量迁移旧格式技能到 SKILL.md 格式（配置层插件化 Phase 5）

用法：
    python backend/migrate_skills.py                    # 预览模式（不写文件）
    python backend/migrate_skills.py --execute           # 执行迁移
    python backend/migrate_skills.py --execute --backup  # 执行迁移并备份原文件
"""

import argparse
import shutil
import sys
from pathlib import Path

import yaml


def migrate_skill(skill_dir: Path, backup: bool = False, dry_run: bool = True) -> dict:
    """将单个旧格式技能迁移为 SKILL.md 格式。

    Args:
        skill_dir: 技能目录路径
        backup: 是否备份原 manifest.yaml 和 system_prompt.md
        dry_run: 仅预览，不写入文件

    Returns:
        {"name": str, "status": "migrated"|"skipped"|"error", "reason": str}
    """
    manifest_path = skill_dir / "manifest.yaml"
    skill_md_path = skill_dir / "SKILL.md"

    # 已经有 SKILL.md 的跳过
    if skill_md_path.exists():
        return {"name": skill_dir.name, "status": "skipped", "reason": "SKILL.md already exists"}

    if not manifest_path.exists():
        return {"name": skill_dir.name, "status": "skipped", "reason": "no manifest.yaml"}

    try:
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    except Exception as e:
        return {"name": skill_dir.name, "status": "error", "reason": f"manifest parse error: {e}"}

    # 读取 system_prompt.md
    system_prompt_path = skill_dir / "system_prompt.md"
    instructions = ""
    if system_prompt_path.exists():
        instructions = system_prompt_path.read_text(encoding="utf-8")

    # 构建 frontmatter
    frontmatter = {
        "name": manifest.get("name", skill_dir.name),
        "version": manifest.get("version", "1.0.0"),
        "description": manifest.get("description", ""),
        "trigger": manifest.get("description", ""),  # 用 description 作为 trigger
        "category": manifest.get("category", ""),
        "methodology": manifest.get("methodology", ""),
    }

    if manifest.get("required_tools"):
        frontmatter["required_tools"] = manifest["required_tools"]
    if manifest.get("keywords"):
        frontmatter["keywords"] = manifest["keywords"]

    # 构建 SKILL.md 内容
    content = "---\n"
    content += yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True)
    content += "---\n\n"
    content += instructions if instructions else f"# {manifest.get('name', skill_dir.name)}\n\n（待补充）\n"

    # 备份原文件
    if backup and not dry_run:
        backup_dir = skill_dir / ".legacy_backup"
        backup_dir.mkdir(exist_ok=True)
        if manifest_path.exists():
            shutil.copy2(manifest_path, backup_dir / "manifest.yaml")
        if system_prompt_path.exists():
            shutil.copy2(system_prompt_path, backup_dir / "system_prompt.md")

    # 写入 SKILL.md（dry_run 模式仅预览）
    if not dry_run:
        skill_md_path.write_text(content, encoding="utf-8")

    return {"name": skill_dir.name, "status": "migrated", "reason": "ok"}


def migrate_all(skill_packs_dir: Path, backup: bool = False, dry_run: bool = True) -> list[dict]:
    """批量迁移所有旧格式技能。"""
    results = []
    for entry in sorted(skill_packs_dir.iterdir()):
        if not entry.is_dir():
            continue
        result = migrate_skill(entry, backup=backup, dry_run=dry_run)
        results.append(result)
    return results


def main():
    parser = argparse.ArgumentParser(description="批量迁移旧格式技能到 SKILL.md")
    parser.add_argument("--execute", action="store_true", help="执行迁移（默认仅预览）")
    parser.add_argument("--backup", action="store_true", help="备份原文件")
    parser.add_argument("--skill-dir", default="skill_packs", help="技能目录路径")
    args = parser.parse_args()

    skill_dir = Path(args.skill_dir)
    if not skill_dir.exists():
        print(f"错误: 技能目录不存在: {skill_dir}")
        sys.exit(1)

    results = migrate_all(skill_dir, backup=args.backup and args.execute, dry_run=not args.execute)

    # 统计
    migrated = [r for r in results if r["status"] == "migrated"]
    skipped = [r for r in results if r["status"] == "skipped"]
    errors = [r for r in results if r["status"] == "error"]

    print(f"\n{'='*60}")
    print(f"技能迁移{'执行' if args.execute else '预览'}")
    print(f"{'='*60}")
    print(f"总计: {len(results)} | 迁移: {len(migrated)} | 跳过: {len(skipped)} | 错误: {len(errors)}")
    print()

    if migrated:
        print("待迁移:")
        for r in migrated:
            prefix = "  ✓" if args.execute else "  ○"
            print(f"{prefix} {r['name']}")
        print()

    if skipped:
        print("跳过:")
        for r in skipped:
            print(f"  - {r['name']}: {r['reason']}")
        print()

    if errors:
        print("错误:")
        for r in errors:
            print(f"  ✗ {r['name']}: {r['reason']}")

    if not args.execute and migrated:
        print(f"\n提示: 使用 --execute 参数执行迁移")
        print(f"提示: 使用 --execute --backup 参数执行迁移并备份原文件")


if __name__ == "__main__":
    main()
