"""技能打包器 - 将基础技能包与项目增量合并，生成经过实战检验的升级版技能包。

项目结束时，负责：
1. 合并基础技能包与增量区内容
2. 脱敏检查（移除 API 密钥、内部路径、隐私数据）
3. 生成 README 文档
4. 压缩为 ZIP 输出
"""

import logging
import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ──────────────────── 脱敏正则规则 ────────────────────

_DESENSITIZE_PATTERNS: list[tuple[str, str, str, re.Pattern]] = [
    # (issue_type, description, replacement, pattern)
    (
        "api_key",
        "OpenAI 风格密钥 (sk-...)",
        "sk-***REDACTED***",
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
    ),
    (
        "api_key",
        "通用 API Key 赋值",
        "api_key=***REDACTED***",
        re.compile(r"(api[_-]?key\s*[=:]\s*['\"]?)[A-Za-z0-9\-_]{16,}(['\"]?)", re.IGNORECASE),
    ),
    (
        "api_key",
        "Bearer Token",
        "Bearer ***REDACTED***",
        re.compile(r"(Bearer\s+)[A-Za-z0-9\-_.]{16,}", re.IGNORECASE),
    ),
    (
        "api_key",
        "通用密钥赋值 (secret/password)",
        "REDACTED",
        re.compile(
            r"((?:secret|password|token|api[_-]?secret)\s*[=:]\s*['\"]?)[A-Za-z0-9\-_]{8,}(['\"]?)",
            re.IGNORECASE,
        ),
    ),
    (
        "internal_path",
        "Unix 用户主目录路径",
        "/home/***",
        re.compile(r"/home/[a-zA-Z][a-zA-Z0-9_.-]{0,30}"),
    ),
    (
        "internal_path",
        "Windows 用户目录路径",
        "C:\\Users\\***",
        re.compile(r"[A-Z]:\\Users\\[a-zA-Z][a-zA-Z0-9_.-]{0,30}", re.IGNORECASE),
    ),
    (
        "internal_path",
        "内部 IPv4 地址 (10.x / 172.16-31.x / 192.168.x)",
        "***.***.***.***",
        re.compile(
            r"(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
            r"|192\.168\.\d{1,3}\.\d{1,3})"
        ),
    ),
    (
        "privacy_data",
        "邮箱地址",
        "***@***.***",
        re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"),
    ),
    (
        "privacy_data",
        "中国大陆手机号",
        "1**********",
        re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    ),
]


@dataclass
class DesensitizeIssue:
    """脱敏检查发现的问题。"""

    file_path: str
    line_number: int
    issue_type: str  # api_key / internal_path / privacy_data
    original_content: str
    redacted_content: str


@dataclass
class PackageResult:
    """完整打包结果。"""

    package_path: str  # ZIP 文件路径
    readme_content: str  # 生成的 README 内容
    desensitize_report: list[DesensitizeIssue]
    diff_summary: dict  # { "new_files": [...], "modified_files": [...], "new_rules": [...] }
    skill_name: str
    base_version: str
    output_version: str


class SkillPackager:
    """技能打包器

    将基础技能包与项目期间积累的增量合并，生成升级版技能包。
    """

    def __init__(self, output_dir: str):
        """初始化技能打包器。

        Args:
            output_dir: 打包输出目录
        """
        self._output_dir = Path(output_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    # ──────────────────── 文件对比 ────────────────────

    @staticmethod
    def _compute_diff(base_dir: str, incremental_dir: str) -> dict:
        """对比基础包和增量区的文件列表，生成变更摘要。

        Args:
            base_dir: 基础技能包目录
            incremental_dir: 增量区目录

        Returns:
            包含 new_files, modified_files, new_rules 的字典
        """
        base_files: set[str] = set()
        for root, _, files in os.walk(base_dir):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), base_dir)
                base_files.add(rel)

        incremental_files: set[str] = set()
        for root, _, files in os.walk(incremental_dir):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), incremental_dir)
                # 跳过 README 和空的 addon
                incremental_files.add(rel)

        new_files = sorted(incremental_files - base_files)
        modified_files = sorted(incremental_files & base_files)

        # 新增规则文件
        rules_dir = os.path.join(incremental_dir, "rules")
        new_rules: list[str] = []
        if os.path.isdir(rules_dir):
            for f in os.listdir(rules_dir):
                if f.endswith(".yaml") or f.endswith(".yml"):
                    new_rules.append(f)

        return {
            "new_files": new_files,
            "modified_files": modified_files,
            "new_rules": new_rules,
        }

    # ──────────────────── 技能合并 ────────────────────

    def merge_skills(self, base_skill_path: str, incremental_path: str) -> str:
        """合并基础技能包和增量区。

        Args:
            base_skill_path: 基础技能包路径（只读参考）
            incremental_path: 增量区路径

        Returns:
            合并后的临时目录路径

        合并策略：
        1. system_prompt.md: 基础版后附加增量的 system_prompt_addon.md 内容
        2. tools/: 增量中同名文件替换，新文件追加
        3. rules/: 合并增量区 approved/ 中的所有规则文件
        4. knowledge/: 基础知识 + knowledge_add/ 中的新知识
        5. examples/: 追加增量区的新案例
        """
        base = Path(base_skill_path)
        inc = Path(incremental_path)

        if not base.is_dir():
            raise FileNotFoundError(f"基础技能包路径不存在: {base_skill_path}")
        if not inc.is_dir():
            raise FileNotFoundError(f"增量区路径不存在: {incremental_path}")

        merged = Path(tempfile.mkdtemp(prefix="skill_merged_"))

        # 先复制基础包全部内容
        for item in base.iterdir():
            dest = merged / item.name
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)

        # 1. system_prompt.md: 追加增量内容
        addon_path = inc / "system_prompt_addon.md"
        if addon_path.is_file():
            addon_content = addon_path.read_text(encoding="utf-8").strip()
            if addon_content:
                prompt_path = merged / "system_prompt.md"
                base_prompt = ""
                if prompt_path.is_file():
                    base_prompt = prompt_path.read_text(encoding="utf-8")
                merged_prompt = base_prompt.rstrip() + "\n\n" + addon_content + "\n"
                prompt_path.write_text(merged_prompt, encoding="utf-8")

        # 2. tools/: 同名替换，新文件追加
        inc_tools = inc / "tools"
        if inc_tools.is_dir():
            merged_tools = merged / "tools"
            merged_tools.mkdir(exist_ok=True)
            for tool_file in inc_tools.iterdir():
                if tool_file.is_file():
                    shutil.copy2(tool_file, merged_tools / tool_file.name)

        # 3. rules/: 合并增量区 rules/ 中的规则文件
        inc_rules = inc / "rules"
        if inc_rules.is_dir():
            merged_rules = merged / "rules"
            merged_rules.mkdir(exist_ok=True)
            for rule_file in inc_rules.iterdir():
                if rule_file.is_file():
                    shutil.copy2(rule_file, merged_rules / rule_file.name)

        # 4. knowledge/: 基础知识 + knowledge_add/
        inc_knowledge = inc / "knowledge_add"
        if inc_knowledge.is_dir():
            merged_knowledge = merged / "knowledge"
            merged_knowledge.mkdir(exist_ok=True)
            for knowledge_file in inc_knowledge.iterdir():
                if knowledge_file.is_file():
                    shutil.copy2(knowledge_file, merged_knowledge / knowledge_file.name)

        # 5. examples/: 追加增量区新案例
        inc_examples = inc / "examples"
        if inc_examples.is_dir():
            merged_examples = merged / "examples"
            merged_examples.mkdir(exist_ok=True)
            for example_file in inc_examples.iterdir():
                if example_file.is_file():
                    shutil.copy2(example_file, merged_examples / example_file.name)

        logger.info("技能合并完成: %s", merged)
        return str(merged)

    def generate_skill_md(self, merged_dir: str, skill_name: str, version: str = "1.0.0") -> str:
        """从合并后的技能包生成 SKILL.md（Agent Skills 标准格式）。

        读取 manifest.yaml 元数据 + system_prompt.md 指令，输出标准 SKILL.md。

        Args:
            merged_dir: 合并后的技能包目录
            skill_name: 技能名称
            version: 版本号

        Returns:
            SKILL.md 的路径
        """
        merged_path = Path(merged_dir)
        manifest = {}
        manifest_path = merged_path / "manifest.yaml"
        if manifest_path.is_file():
            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = yaml.safe_load(f) or {}
            except Exception:
                pass

        # 读取指令
        instructions = ""
        prompt_path = merged_path / "system_prompt.md"
        if prompt_path.is_file():
            instructions = prompt_path.read_text(encoding="utf-8").strip()

        # 构建 SKILL.md
        meta_lines = [
            "---",
            f"name: {manifest.get('name', skill_name)}",
            f"version: {manifest.get('version', version)}",
            f"description: {manifest.get('description', '')}",
            f"category: {manifest.get('category', '')}",
            f"methodology: {manifest.get('methodology', '')}",
        ]
        if manifest.get("required_tools"):
            meta_lines.append(f"required_tools: {manifest['required_tools']}")
        if manifest.get("keywords"):
            meta_lines.append(f"keywords: {manifest['keywords']}")
        meta_lines.append("---")
        meta_lines.append("")
        meta_lines.append(instructions)

        skill_md_path = merged_path / "SKILL.md"
        skill_md_path.write_text("\n".join(meta_lines), encoding="utf-8")
        logger.info("生成 SKILL.md: %s", skill_md_path)
        return str(skill_md_path)

    # ──────────────────── 脱敏检查 ────────────────────

    def desensitize_check(self, merged_dir: str) -> list[DesensitizeIssue]:
        """脱敏检查。

        扫描合并后的技能包，检测并移除：
        1. API 密钥模式：sk-xxx, api_key=xxx, Bearer xxx 等
        2. 内部路径：/home/username, C:\\Users\\xxx, 内部 IP 地址
        3. 隐私数据：邮箱、手机号模式

        Args:
            merged_dir: 合并后的技能包目录

        Returns:
            发现的问题列表
        """
        issues: list[DesensitizeIssue] = []
        merged_path = Path(merged_dir)

        if not merged_path.is_dir():
            logger.warning("脱敏检查目录不存在: %s", merged_dir)
            return issues

        for file_path in merged_path.rglob("*"):
            if not file_path.is_file():
                continue
            # 跳过二进制文件
            if file_path.suffix.lower() in {".zip", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot"}:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            lines = content.split("\n")
            modified_lines: list[str] = []
            file_changed = False

            for line_idx, line in enumerate(lines):
                new_line = line
                for issue_type, _desc, replacement, pattern in _DESENSITIZE_PATTERNS:
                    for match in pattern.finditer(new_line):
                        original = match.group(0)
                        # 对于有捕获组的模式，保留前缀并替换敏感部分
                        if match.lastindex and match.lastindex >= 1:
                            prefix = match.group(1)
                            suffix = match.group(match.lastindex) if match.lastindex > 1 else ""
                            redacted = prefix + replacement + suffix
                        else:
                            redacted = replacement

                        if original != redacted:
                            rel_path = os.path.relpath(file_path, merged_dir)
                            issues.append(DesensitizeIssue(
                                file_path=rel_path,
                                line_number=line_idx + 1,
                                issue_type=issue_type,
                                original_content=original,
                                redacted_content=redacted,
                            ))
                            new_line = new_line.replace(original, redacted, 1)
                            file_changed = True

                modified_lines.append(new_line)

            if file_changed:
                file_path.write_text("\n".join(modified_lines), encoding="utf-8")

        logger.info("脱敏检查完成，发现 %d 个问题", len(issues))
        return issues

    # ──────────────────── README 生成 ────────────────────

    def generate_readme(
        self,
        skill_name: str,
        base_version: str,
        diff_summary: dict,
        rules_summary: list[dict],
    ) -> str:
        """生成自动 README。

        包含：
        - 技能包名称和版本
        - 本次项目中的进化点
        - 新增规则摘要
        - 适用场景

        Args:
            skill_name: 技能包名称
            base_version: 基础版本号
            diff_summary: 变更摘要
            rules_summary: 新增规则列表

        Returns:
            README 内容字符串
        """
        new_files = diff_summary.get("new_files", [])
        modified_files = diff_summary.get("modified_files", [])
        new_rules = diff_summary.get("new_rules", [])

        # 版本号自增
        output_version = self._bump_version(base_version)

        lines = [
            f"# {skill_name} v{output_version}",
            "",
            f"> 由 SkillPackager 自动生成，基于基础版 v{base_version} 与项目实战增量合并。",
            "",
            "## 版本信息",
            "",
            f"- **技能名称**: {skill_name}",
            f"- **基础版本**: {base_version}",
            f"- **输出版本**: {output_version}",
            "",
            "## 本次进化点",
            "",
        ]

        if new_files:
            lines.append("### 新增文件")
            lines.append("")
            for f in new_files:
                lines.append(f"- `{f}`")
            lines.append("")

        if modified_files:
            lines.append("### 修改文件")
            lines.append("")
            for f in modified_files:
                lines.append(f"- `{f}`")
            lines.append("")

        if new_rules:
            lines.append("### 新增规则")
            lines.append("")
            for rule_file in new_rules:
                lines.append(f"- `{rule_file}`")
            lines.append("")

        if rules_summary:
            lines.append("## 规则摘要")
            lines.append("")
            for i, rule in enumerate(rules_summary, 1):
                trigger = rule.get("trigger_condition", "")
                action = rule.get("action", "")
                note = rule.get("note", "")
                lines.append(f"### 规则 {i}")
                lines.append(f"- **触发条件**: {trigger}")
                lines.append(f"- **建议动作**: {action}")
                if note:
                    lines.append(f"- **补充说明**: {note}")
                lines.append("")

        lines.extend([
            "## 适用场景",
            "",
            "本技能包适用于经过项目实战验证的场景，融合了基础技能与项目执行过程中积累的经验规则。",
            "",
            "## 使用说明",
            "",
            "1. 将技能包解压到工作目录",
            "2. 根据 `system_prompt.md` 配置智能体系统指令",
            "3. 参考 `rules/` 目录下的经验规则优化任务执行",
            "",
        ])

        return "\n".join(lines)

    @staticmethod
    def _bump_version(version: str) -> str:
        """将版本号的次版本号 +1。

        Args:
            version: 原始版本号，如 "1.0.0"

        Returns:
            自增后的版本号，如 "1.1.0"
        """
        parts = version.split(".")
        while len(parts) < 3:
            parts.append("0")
        try:
            minor = int(parts[1]) + 1
            parts[1] = str(minor)
            parts[2] = "0"
        except (ValueError, IndexError):
            # 非数字版本号，直接追加
            return version + ".1"
        return ".".join(parts)

    # ──────────────────── ZIP 打包 ────────────────────

    def package_zip(self, merged_dir: str, project_id: str, skill_name: str, version: str = "1.0.0") -> str:
        """压缩为 ZIP。

        Args:
            merged_dir: 合并后的技能包目录
            project_id: 项目 ID
            skill_name: 技能名称
            version: 版本号（从 manifest.yaml 读取并 bump 后）

        Returns:
            ZIP 文件路径

        文件名格式: {project_id}_{skill_name}_v{version}.zip
        """
        safe_name = re.sub(r"[^\w\-]", "_", skill_name)
        zip_name = f"{project_id}_{safe_name}_v{version}.zip"
        zip_path = self._output_dir / zip_name

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            merged_path = Path(merged_dir)
            for file_path in sorted(merged_path.rglob("*")):
                if file_path.is_file():
                    arcname = os.path.relpath(file_path, merged_dir).replace("\\", "/")
                    zf.write(file_path, arcname)

        logger.info("ZIP 打包完成: %s", zip_path)
        return str(zip_path)

    # ──────────────────── 预览 ────────────────────

    def preview_package(self, base_skill_path: str, incremental_path: str) -> dict:
        """预览技能包内容。

        Args:
            base_skill_path: 基础技能包路径
            incremental_path: 增量区路径

        Returns:
            {
                "structure_tree": str,      # 目录树
                "diff_summary": dict,       # 变更摘要
                "new_rules": list[dict],    # 新增规则列表
                "modified_files": list[str] # 修改的文件
            }
        """
        diff_summary = self._compute_diff(base_skill_path, incremental_path)

        # 生成合并后的目录树预览
        structure_tree = self._build_tree_preview(base_skill_path, incremental_path)

        # 解析新增规则
        rules_dir = os.path.join(incremental_path, "rules")
        new_rules: list[dict] = []
        if os.path.isdir(rules_dir):
            for fname in sorted(os.listdir(rules_dir)):
                fpath = os.path.join(rules_dir, fname)
                if fname.endswith((".yaml", ".yml")) and os.path.isfile(fpath):
                    try:
                        import yaml
                        with open(fpath, encoding="utf-8") as f:
                            data = yaml.safe_load(f)
                        if isinstance(data, dict) and "rules" in data:
                            for r in data["rules"]:
                                if isinstance(r, dict):
                                    new_rules.append({
                                        "rule_id": r.get("rule_id", ""),
                                        "trigger_condition": r.get("trigger_condition", ""),
                                        "action": r.get("action", ""),
                                        "rule_type": r.get("rule_type", ""),
                                    })
                    except Exception:
                        new_rules.append({"file": fname, "error": "解析失败"})

        return {
            "structure_tree": structure_tree,
            "diff_summary": diff_summary,
            "new_rules": new_rules,
            "modified_files": diff_summary.get("modified_files", []),
        }

    @staticmethod
    def _build_tree_preview(base_dir: str, incremental_dir: str) -> str:
        """构建合并后的目录树预览。"""
        base_path = Path(base_dir)
        inc_path = Path(incremental_dir)

        # 收集所有文件路径（相对于各自根目录）
        all_files: set[str] = set()

        if base_path.is_dir():
            for f in base_path.rglob("*"):
                if f.is_file():
                    all_files.add(os.path.relpath(f, base_path))

        if inc_path.is_dir():
            for f in inc_path.rglob("*"):
                if f.is_file():
                    rel = os.path.relpath(f, inc_path)
                    # 增量区的文件映射到合并后的路径
                    if rel.startswith("knowledge_add"):
                        mapped = rel.replace("knowledge_add", "knowledge", 1)
                    else:
                        mapped = rel
                    all_files.add(mapped)

        if not all_files:
            return "(空)"

        # 构建树形结构
        tree: dict = {}
        for fpath in sorted(all_files):
            parts = fpath.replace("\\", "/").split("/")
            node = tree
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node.setdefault("__files__", []).append(parts[-1])

        def _render(node: dict, prefix: str = "") -> list[str]:
            lines: list[str] = []
            dirs = sorted(k for k in node if k != "__files__")
            files = sorted(node.get("__files__", []))
            entries = dirs + files
            for i, entry in enumerate(entries):
                is_last = i == len(entries) - 1
                connector = "└── " if is_last else "├── "
                if entry in dirs:
                    lines.append(f"{prefix}{connector}{entry}/")
                    extension = "    " if is_last else "│   "
                    lines.extend(_render(node[entry], prefix + extension))
                else:
                    lines.append(f"{prefix}{connector}{entry}")
            return lines

        result_lines = _render(tree)
        return "\n".join(result_lines)

    # ──────────────────── 完整打包流程 ────────────────────

    def full_package(
        self,
        base_skill_path: str,
        incremental_path: str,
        project_id: str,
        skill_name: str,
    ) -> PackageResult:
        """完整打包流程。

        1. merge_skills
        2. desensitize_check
        3. generate_readme
        4. package_zip
        5. 清理临时文件

        Args:
            base_skill_path: 基础技能包路径
            incremental_path: 增量区路径
            project_id: 项目 ID
            skill_name: 技能名称

        Returns:
            PackageResult 打包结果
        """
        merged_dir: Optional[str] = None
        try:
            # 1. 合并
            merged_dir = self.merge_skills(base_skill_path, incremental_path)

            # 1.5 读取版本号 + 生成 SKILL.md（Agent Skills 标准格式）
            base_version = "1.0.0"
            manifest_path = Path(base_skill_path) / "manifest.yaml"
            if manifest_path.is_file():
                try:
                    import yaml
                    with open(manifest_path, encoding="utf-8") as f:
                        manifest = yaml.safe_load(f)
                    if isinstance(manifest, dict):
                        base_version = manifest.get("version", "1.0.0")
                except Exception:
                    logger.debug("读取基础技能 manifest 失败，使用默认版本")
            self.generate_skill_md(merged_dir, skill_name, base_version)

            # 2. 脱敏检查
            desensitize_report = self.desensitize_check(merged_dir)

            # 3. 生成变更摘要
            diff_summary = self._compute_diff(base_skill_path, incremental_path)

            # 4. 生成 README

            # 解析规则摘要
            rules_summary: list[dict] = []
            rules_dir = os.path.join(incremental_path, "rules")
            if os.path.isdir(rules_dir):
                for fname in os.listdir(rules_dir):
                    fpath = os.path.join(rules_dir, fname)
                    if fname.endswith((".yaml", ".yml")) and os.path.isfile(fpath):
                        try:
                            import yaml
                            with open(fpath, encoding="utf-8") as f:
                                data = yaml.safe_load(f)
                            if isinstance(data, dict) and "rules" in data:
                                for r in data["rules"]:
                                    if isinstance(r, dict):
                                        rules_summary.append({
                                            "trigger_condition": r.get("trigger_condition", ""),
                                            "action": r.get("action", ""),
                                            "note": r.get("note", ""),
                                            "rule_type": r.get("rule_type", ""),
                                        })
                        except Exception:
                            logger.debug("解析规则文件失败: %s", fname)

            output_version = self._bump_version(base_version)
            readme_content = self.generate_readme(skill_name, base_version, diff_summary, rules_summary)

            # 将 README 写入合并目录
            readme_path = Path(merged_dir) / "README.md"
            readme_path.write_text(readme_content, encoding="utf-8")

            # 5. ZIP 打包
            package_path = self.package_zip(merged_dir, project_id, skill_name, version=output_version)

            return PackageResult(
                package_path=package_path,
                readme_content=readme_content,
                desensitize_report=desensitize_report,
                diff_summary=diff_summary,
                skill_name=skill_name,
                base_version=base_version,
                output_version=output_version,
            )
        finally:
            # 清理临时文件
            if merged_dir and os.path.isdir(merged_dir):
                shutil.rmtree(merged_dir, ignore_errors=True)
                logger.info("已清理临时目录: %s", merged_dir)
