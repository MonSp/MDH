"""
小说生成项目端到端测试 - 验证智能体公司的内容创作团队能力

测试内容：
1. 从 roles_config.yaml 加载内容创作团队角色
2. 验证角色的技能包（skills）和工具包（tools）正确配置
3. 组建团队、分配角色、启动会议
4. 走完整流程：需求确认→语义分析→团队讨论→任务分派→写作执行→质量审查→项目总结
5. 验证生成的小说章节文件实际写入工作区

使用方法：
  python backend/test_novel_project.py --api-key YOUR_KEY --theme "赛博朋克世界中一个AI觉醒的故事"
  python backend/test_novel_project.py --api-key YOUR_KEY --base-url https://api.deepseek.com --theme "末日废土上的邮递员"
  python backend/test_novel_project.py --api-key YOUR_KEY --team-size 6 --theme "三国谋士穿越到现代职场"
"""

import argparse
import asyncio
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from agent_toolset import load_roles_config, AgentToolset
from meeting import MeetingSession, create_team_from_roles, ROLE_TO_AGENT_ROLE
from meeting_coordinator import MeetingCoordinator
from protocol import AgentRole
from workspace_manager import WorkspaceManager, WorkspaceType


# ============================================================================
# 小说创作团队定义
# ============================================================================

NOVEL_TEAM_ROLES = {
    # 核心团队（4人）
    "core": [
        "content_director",   # 内容总监 → COORDINATOR: 统筹全局、风格把控
        "screenwriter",       # 编剧       → PLANNER:     故事架构、角色设计
        "content_writer",     # 撰稿人   → EXECUTOR:   正文写作
        "content_editor",     # 编辑       → REVIEWER:   审校润色、质量把关
    ],
    # 扩展团队（6人，增加视觉和深度审查）
    "extended": [
        "content_director",
        "screenwriter",
        "content_writer",
        "content_editor",
        "graphic_designer",   # 美术设计 → EXECUTOR: 封面概念、插图描述
        "content_architect",  # 内容架构师 → PLANNER: 章节结构、信息架构
    ],
}


def parse_args():
    parser = argparse.ArgumentParser(description="小说生成项目 - 智能体公司端到端测试")
    parser.add_argument("--api-key", required=True, help="LLM API Key")
    parser.add_argument("--base-url", default="", help="LLM API Base URL")
    parser.add_argument("--provider", default="deepseek", help="模型提供商 (默认: deepseek)")
    parser.add_argument("--model", default="", help="模型名称")
    parser.add_argument("--theme", required=True, help="小说主题/题材描述")
    parser.add_argument("--team-size", type=int, default=4, choices=[4, 6],
                        help="团队规模: 4=核心团队, 6=扩展团队 (默认: 4)")
    parser.add_argument("--output-dir", default="", help="小说输出目录（默认: 工作区内）")
    return parser.parse_args()


# ============================================================================
# 阶段验证器
# ============================================================================

class PhaseTracker:
    """跟踪并验证流程各阶段"""

    REQUIRED_PHASES = [
        "ROLE_VALIDATION",
        "TEAM_ASSEMBLY",
        "CEO_HANDOFF",
        "REQUIREMENTS_CONFIRMATION",
        "ANALYSIS",
        "PROJECT_PLANNING",
        "DISCUSSION",
        "TASK_ASSIGNMENT",
        "EXECUTION",
        "REVIEW",
        "PROJECT_SUMMARY",
        "REPORT",
    ]

    def __init__(self):
        self.messages = []
        self.phases_seen = {}
        self.role_info = {}
        self.skill_info = {}
        self.tool_info = {}

    async def track(self, agent_id, text, delta, **kwargs):
        safe_text = self._sanitize(text)
        phase = self._detect_phase(safe_text, agent_id)
        self.messages.append({
            "agent_id": agent_id,
            "text": safe_text,
            "phase": phase,
            "timestamp": time.time(),
        })
        if phase != "OTHER":
            self.phases_seen.setdefault(phase, [])
            self.phases_seen[phase].append(safe_text[:100])

        # 打印消息（截断长消息）
        display = safe_text[:120] + "..." if len(safe_text) > 120 else safe_text
        print(f"  [{agent_id}] {display}")

    def _sanitize(self, text):
        text = text.replace('\u2022', '-').replace('\u2713', '[OK]').replace('\u2717', '[X]')
        text = re.sub(r'[\U0001f300-\U0001f9ff]', '', text)
        return text

    def _detect_phase(self, text, agent_id):
        if 'CEO' in text and ('收到任务' in text or '已交给' in text):
            return 'CEO_HANDOFF'
        if '确认细节' in text or '需求确认' in text:
            return 'REQUIREMENTS_CONFIRMATION'
        if '项目经理分析' in text or ('意图' in text and '复杂度' in text):
            return 'ANALYSIS'
        if '制定项目计划' in text or '阶段1' in text:
            return 'PROJECT_PLANNING'
        if '组织团队讨论' in text:
            return 'DISCUSSION'
        if '整合讨论结果' in text:
            return 'INTEGRATION'
        if '分派' in text and '任务' in text:
            return 'TASK_ASSIGNMENT'
        if '正在执行任务' in text or '监督' in text:
            return 'EXECUTION'
        if '项目总结' in text:
            return 'PROJECT_SUMMARY'
        if '汇报结果' in text or '收到项目经理汇报' in text:
            return 'REPORT'
        # 审查阶段（由reviewer/monitor/editor的消息触发）
        review_keywords = ['审查', '审核', '校对', '改进建议', '质量', '审查意见', '评估',
                           '关键问题', '主要问题', '经审查', '从代码', '尚未', '风险']
        if any(kw in text for kw in review_keywords):
            return 'REVIEW'
        return 'OTHER'

    def print_summary(self):
        print("\n" + "=" * 70)
        print("消息流分析")
        print("=" * 70)
        phase_counts = {}
        for msg in self.messages:
            phase_counts[msg['phase']] = phase_counts.get(msg['phase'], 0) + 1
        for phase, count in sorted(phase_counts.items()):
            marker = " *" if phase in [p for p in self.REQUIRED_PHASES] else ""
            print(f"  {phase}: {count} 条消息{marker}")

    def validate(self):
        print("\n" + "=" * 70)
        print("阶段验证")
        print("=" * 70)
        all_ok = True
        for phase in self.REQUIRED_PHASES:
            if phase in self.phases_seen:
                print(f"  [OK]      {phase}")
            else:
                print(f"  [MISSING] {phase}")
                all_ok = False
        return all_ok


# ============================================================================
# 角色配置验证
# ============================================================================

def validate_roles(roles_config: dict, role_ids: list) -> bool:
    """验证角色配置完整性：技能包、工具包、提示词模板"""
    print("\n" + "=" * 70)
    print("角色配置验证")
    print("=" * 70)

    base_roles = roles_config.get("base_roles", {})
    custom_roles = roles_config.get("custom_roles", {})
    all_roles = {**base_roles, **custom_roles}
    skills_config = roles_config.get("skills", {})
    all_ok = True

    for role_id in role_ids:
        role_cfg = all_roles.get(role_id)
        if not role_cfg:
            print(f"  [FAIL] 角色 '{role_id}' 不存在于 roles_config.yaml")
            all_ok = False
            continue

        name = role_cfg.get("name", role_id)
        desc = role_cfg.get("description", "")[:60]
        agent_role = ROLE_TO_AGENT_ROLE.get(role_id, AgentRole.EXECUTOR)
        skills = role_cfg.get("skills", [])
        tools = role_cfg.get("permissions", {}).get("tools", [])
        prompt_tmpl = role_cfg.get("prompt_template", "N/A")

        print(f"\n  --- {name} ({role_id}) → {agent_role.value} ---")
        print(f"  描述:     {desc}")
        print(f"  提示词模板: {prompt_tmpl}")

        # 验证技能包
        if skills:
            valid_skills = [s for s in skills if s in skills_config]
            missing_skills = [s for s in skills if s not in skills_config]
            print(f"  技能包({len(skills)}): {', '.join(skills)}")
            if missing_skills:
                print(f"    [WARN] 未在skills配置中找到: {', '.join(missing_skills)}")
            for s in valid_skills:
                skill_info = skills_config[s]
                s_name = skill_info.get("name", s)
                s_cat = skill_info.get("category", "?")
                print(f"    - {s_name} [{s_cat}]")
        else:
            print("  技能包:   (无)")
            all_ok = False

        # 验证工具包
        if tools:
            print(f"  工具包({len(tools)}): {', '.join(tools)}")
        else:
            print("  工具包:   (无)")
            all_ok = False

        # 验证 AgentToolset 可以正确加载
        try:
            toolset = AgentToolset(
                agent_id=f"test-{role_id}",
                agent_role=role_id,
                workspace_root=".",
            )
            print(f"  AgentToolset: 加载成功 (可用工具: {len(toolset.available_tools)})")
        except Exception as e:
            print(f"  AgentToolset: [FAIL] {e}")
            all_ok = False

    print(f"\n  结论: {'全部通过' if all_ok else '存在问题'}")
    return all_ok


# ============================================================================
# 团队组装验证
# ============================================================================

def validate_team_assembly(roles_config: dict, role_ids: list) -> list:
    """验证团队组装逻辑"""
    print("\n" + "=" * 70)
    print("团队组装验证")
    print("=" * 70)

    team = create_team_from_roles(role_ids, roles_config)

    print(f"  请求角色: {role_ids}")
    print(f"  组装结果: {len(team)} 个成员")

    for agent_def in team:
        agent_id = agent_def["id"]
        name = agent_def["name"]
        role = agent_def["role"].value
        caps = agent_def.get("capabilities", [])
        config_id = agent_def.get("role_config_id", "N/A")
        print(f"    {agent_id}: {name} → {role} (技能: {', '.join(caps[:4])}{'...' if len(caps) > 4 else ''})")

    # 验证有 coordinator
    has_coordinator = any(t["role"] in (AgentRole.CEO, AgentRole.COORDINATOR) for t in team)
    print(f"  协调者存在: {'是' if has_coordinator else '否 [WARN]'}")

    return team


# ============================================================================
# 输出文件验证
# ============================================================================

def validate_output(workspace_root: str, theme: str) -> bool:
    """验证小说文件是否实际生成"""
    print("\n" + "=" * 70)
    print("输出文件验证")
    print("=" * 70)

    workspace = Path(workspace_root)
    if not workspace.exists():
        print(f"  [FAIL] 工作区不存在: {workspace_root}")
        return False

    # 扫描所有生成的文件
    all_files = list(workspace.rglob("*"))
    text_files = [f for f in all_files if f.is_file() and f.suffix in ('.md', '.txt', '.py', '.js', '.html', '.json')]

    print(f"  工作区: {workspace_root}")
    print(f"  总文件数: {len(all_files)}")
    print(f"  文本文件: {len(text_files)}")

    if not text_files:
        print("  [FAIL] 未找到任何文本文件")
        return False

    # 检查文件内容质量
    total_chars = 0
    novel_files = []
    for f in text_files:
        try:
            content = f.read_text(encoding="utf-8")
            char_count = len(content)
            total_chars += char_count
            has_chinese = bool(re.search(r'[\u4e00-\u9fff]', content))
            display_name = str(f.relative_to(workspace))
            print(f"    {display_name}: {char_count} 字 {'[含中文]' if has_chinese else ''}")
            if char_count > 100:
                novel_files.append(f)
        except Exception as e:
            print(f"    {f.name}: [读取失败] {e}")

    print(f"\n  总字数: {total_chars}")
    print(f"  有效文件(>100字): {len(novel_files)}")

    # 验证主题相关性（简单检查）
    theme_keywords = set(re.findall(r'[\u4e00-\u9fff]{2,}', theme))
    if theme_keywords:
        all_content = ""
        for f in novel_files[:5]:
            try:
                all_content += f.read_text(encoding="utf-8")
            except:
                pass
        matched_keywords = [kw for kw in theme_keywords if kw in all_content]
        if matched_keywords:
            print(f"  主题相关关键词命中: {', '.join(matched_keywords[:5])}")
        else:
            print("  [WARN] 未命中主题关键词（可能由LLM创造性发挥）")

    ok = len(novel_files) > 0
    print(f"\n  结论: {'有实际内容生成' if ok else '无有效内容'}")
    return ok


# ============================================================================
# 主测试流程
# ============================================================================

async def run_novel_test(
    api_key: str,
    base_url: str,
    provider: str,
    model_name: str,
    theme: str,
    team_size: int,
    output_dir: str,
):
    tracker = PhaseTracker()

    print("=" * 70)
    print("小说生成项目 - 智能体公司端到端测试")
    print("=" * 70)
    print(f"  主题:   {theme}")
    print(f"  团队:   {team_size}人{'核心' if team_size == 4 else '扩展'}团队")
    print(f"  模型:   {provider}/{model_name or '(默认)'}")
    print(f"  Base URL: {base_url or '(默认)'}")
    print("=" * 70)

    # ── 1. 加载角色配置 ──
    print("\n[1/6] 加载角色配置...")
    roles_config = load_roles_config()
    if not roles_config:
        print("  [FAIL] 无法加载 roles_config.yaml")
        return False

    team_key = "core" if team_size == 4 else "extended"
    role_ids = NOVEL_TEAM_ROLES[team_key]
    print(f"  已加载 {len(roles_config.get('base_roles', {}))} 个基础角色")
    print(f"  已加载 {len(roles_config.get('custom_roles', {}))} 个自定义角色")
    print(f"  已加载 {len(roles_config.get('skills', {}))} 个技能定义")
    tracker.phases_seen.setdefault("ROLE_VALIDATION", []).append("配置加载完成")

    # ── 2. 验证角色配置 ──
    print("\n[2/6] 验证角色配置...")
    roles_ok = validate_roles(roles_config, role_ids)
    if not roles_ok:
        print("  [WARN] 部分角色配置存在问题，继续测试...")

    # ── 3. 组装团队 ──
    print("\n[3/6] 组装团队...")
    team = validate_team_assembly(roles_config, role_ids)
    tracker.phases_seen.setdefault("TEAM_ASSEMBLY", []).append(f"{len(team)} 个成员")

    # ── 4. 创建工作区 ──
    print("\n[4/6] 创建工作区...")
    if output_dir:
        workspace_root = output_dir
        os.makedirs(workspace_root, exist_ok=True)
        workspace = type('Workspace', (), {'root_path': workspace_root, 'workspace_id': 'custom'})()
    else:
        workspaces_base = os.environ.get(
            "AGENT_WORKSPACES_DIR",
            os.path.join(os.path.expanduser("~"), ".agent-workspaces")
        )
        workspace_mgr = WorkspaceManager(workspaces_dir=workspaces_base)
        workspace = workspace_mgr.create_workspace(
            task_id=f"novel-{int(time.time())}",
            workspace_type=WorkspaceType.STANDALONE,
        )
        workspace_root = workspace.root_path
    print(f"  工作区: {workspace_root}")

    # ── 5. 创建会议并执行 ──
    print("\n[5/6] 启动会议，执行小说创作流程...")
    print("-" * 70)

    meeting = MeetingSession(f"novel-{int(time.time())}")
    meeting.start(team_template=team)

    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        workspace=workspace,
    )

    # 构造带有小说写作指导的任务描述
    task_description = (
        f"请围绕以下主题创作一篇短篇小说：\n"
        f"主题：{theme}\n\n"
        f"要求：\n"
        f"1. 先讨论故事大纲、角色设定和世界观\n"
        f"2. 写作完成后将小说正文以 markdown 文件形式写入工作区\n"
        f"3. 文件命名格式：chapter_1.md, chapter_2.md 等\n"
        f"4. 每章至少 500 字，包含场景描写和对话\n"
        f"5. 最后生成一个 README.md 包含故事简介和角色表\n"
        f"6. 请在代码块中使用文件名格式，如：```chapter_1.md\n小说正文...\n```"
    )

    try:
        result = await coordinator.process_user_message(task_description, tracker.track)
        print("\n" + "-" * 70)
        print(f"  流程完成! 结果类型: {result.get('type')}")
        print(f"  总消息数: {len(tracker.messages)}")
    except Exception as e:
        import traceback
        print("\n" + "-" * 70)
        print(f"  流程异常: {type(e).__name__}: {str(e)[:200]}")
        print(f"  异常前消息数: {len(tracker.messages)}")
        traceback.print_exc()

    # ── 6. 验证输出 ──
    print("\n[6/6] 验证输出文件...")
    files_ok = validate_output(workspace_root, theme)

    # ── 最终报告 ──
    tracker.print_summary()
    phases_ok = tracker.validate()

    print("\n" + "=" * 70)
    print("最终报告")
    print("=" * 70)
    print(f"  角色配置: {'通过' if roles_ok else '部分通过'}")
    print(f"  团队组装: 通过 ({len(team)} 人)")
    print(f"  流程完整: {'通过' if phases_ok else '不完整'}")
    print(f"  文件生成: {'通过' if files_ok else '未生成'}")
    print(f"  消息总数: {len(tracker.messages)}")
    print(f"  输出目录: {workspace_root}")

    overall = phases_ok and files_ok
    print(f"\n  结论: {'测试通过!' if overall else '测试未完全通过'}")
    print("=" * 70)
    return overall


def main():
    args = parse_args()
    try:
        success = asyncio.run(run_novel_test(
            api_key=args.api_key,
            base_url=args.base_url,
            provider=args.provider,
            model_name=args.model,
            theme=args.theme,
            team_size=args.team_size,
            output_dir=args.output_dir,
        ))
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n用户中断")
        return 130
    except Exception as e:
        print(f"\n测试异常: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
