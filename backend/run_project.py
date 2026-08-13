"""
智能体公司 - 交互式项目测试脚本

直接运行，输入目标，自动完成全流程。

使用方法：
  python backend/run_project.py --api-key YOUR_KEY
  python backend/run_project.py --api-key YOUR_KEY --base-url https://api.deepseek.com
  python backend/run_project.py --api-key YOUR_KEY --provider deepseek --model deepseek-chat

交互模式：
  python backend/run_project.py --api-key YOUR_KEY
  > 请输入项目目标: 三国谋士穿越到现代职场
  > 选择团队规模 [4/6] (默认4): 6
  > 自动执行中...

指定模式：
  python backend/run_project.py --api-key YOUR_KEY --goal "三国谋士穿越到现代职场" --team 6
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
from workflow_engine import WorkflowEngine
from workspace_manager import WorkspaceManager, WorkspaceType


# ============================================================================
# 团队配置
# ============================================================================

TEAM_PROFILES = {
    "novel": {
        "name": "小说创作团队",
        "keywords": ["小说", "故事", "写作", "创作", "剧本", "穿越", "科幻", "奇幻", "武侠", "言情", "悬疑", "推理", "童话", "寓言"],
        "roles_4": ["content_director", "screenwriter", "content_writer", "content_editor"],
        "roles_6": ["content_director", "screenwriter", "content_writer", "content_editor", "graphic_designer", "content_architect"],
    },
    "software": {
        "name": "软件开发团队",
        "keywords": ["代码", "程序", "网站", "APP", "系统", "接口", "API", "前端", "后端", "数据库", "部署", "开发", "编程", "calculator", "todo", "web"],
        "roles_4": ["coordinator", "planner", "executor", "reviewer"],
        "roles_6": ["coordinator", "planner", "executor", "reviewer", "monitor", "data_analyst"],
    },
    "content": {
        "name": "内容运营团队",
        "keywords": ["文章", "公众号", "推文", "营销", "文案", "SEO", "博客", "新闻稿", "PPT", "报告", "方案"],
        "roles_4": ["content_director", "content_writer", "content_editor", "graphic_designer"],
        "roles_6": ["content_director", "content_writer", "content_editor", "graphic_designer", "content_architect", "coordinator"],
    },
    "data": {
        "name": "数据分析团队",
        "keywords": ["数据", "分析", "报表", "可视化", "图表", "统计", "指标", "仪表盘", "BI", "SQL"],
        "roles_4": ["data_lead", "data_analyst", "data_engineer", "data_visualizer"],
        "roles_6": ["data_lead", "data_analyst", "data_engineer", "data_visualizer", "ml_engineer", "coordinator"],
    },
    "movie": {
        "name": "影视创作团队",
        "keywords": ["视频", "短片", "动画", "电影", "分镜", "剪辑", "配乐", "特效", "纪录片"],
        "roles_4": ["director", "screenwriter", "image_artist", "video_editor"],
        "roles_6": ["director", "screenwriter", "image_artist", "video_editor", "sound_designer", "video_artist"],
    },
    "default": {
        "name": "通用团队",
        "keywords": [],
        "roles_4": ["coordinator", "planner", "executor", "reviewer"],
        "roles_6": ["coordinator", "planner", "executor", "reviewer", "monitor", "content_writer"],
    },
}


def detect_team_profile(goal: str) -> str:
    """根据目标自动检测最适合的团队类型"""
    goal_lower = goal.lower()
    scores = {}
    for profile_id, profile in TEAM_PROFILES.items():
        if profile_id == "default":
            continue
        score = sum(1 for kw in profile["keywords"] if kw in goal_lower)
        if score > 0:
            scores[profile_id] = score
    if not scores:
        return "default"
    return max(scores, key=scores.get)


# ============================================================================
# 输出
# ============================================================================

def print_banner():
    print()
    print("=" * 60)
    print("  智能体公司 - 交互式项目测试")
    print("=" * 60)


def print_phase(text, indent=0):
    prefix = "  " * indent
    print(f"{prefix}{'─' * 50}")
    print(f"{prefix}{text}")


def print_result(label, value, indent=1):
    prefix = "  " * indent
    print(f"{prefix}{label}: {value}")


# ============================================================================
# 消息跟踪
# ============================================================================

class MessageTracker:
    def __init__(self):
        self.messages = []
        self.phases = {}
        self.start_time = time.time()

    async def track(self, agent_id, text, delta, **kwargs):
        safe = text.replace('\u2022', '-').replace('\u2713', '[OK]').replace('\u2717', '[X]')
        safe = re.sub(r'[\U0001f300-\U0001f9ff]', '', safe)
        phase = self._detect_phase(safe)
        self.messages.append({"agent_id": agent_id, "text": safe, "phase": phase})
        if phase != "OTHER":
            self.phases.setdefault(phase, []).append(safe[:80])

        tag = f"[{phase}]" if phase != "OTHER" else ""
        display = safe[:100] + "..." if len(safe) > 100 else safe
        print(f"  {tag:22s} {agent_id}: {display}")

    def _detect_phase(self, text):
        if 'CEO' in text and ('收到任务' in text or '已交给' in text):
            return 'CEO_HANDOFF'
        if '确认细节' in text or '需求确认' in text:
            return 'REQUIREMENTS'
        if '项目经理分析' in text or ('意图' in text and '复杂度' in text):
            return 'ANALYSIS'
        if '制定项目计划' in text or '阶段1' in text:
            return 'PLANNING'
        if '组织团队讨论' in text:
            return 'DISCUSSION'
        if '整合讨论结果' in text or '整合团队讨论' in text:
            return 'INTEGRATION'
        if '分派' in text and '任务' in text:
            return 'ASSIGNMENT'
        if '轮开发' in text or '监督任务执行' in text:
            return 'EXECUTION'
        if '轮质量审查' in text:
            return 'REVIEW'
        if '轮审查通过' in text:
            return 'REVIEW_PASS'
        if '审查发现问题' in text or '启动修复' in text:
            return 'REVIEW_FIX'
        review_kws = ['审查', '审核', '校对', '改进建议', '审查意见', '评估',
                      '关键问题', '主要问题', '经审查', '风险', '潜在风险']
        if any(kw in text for kw in review_kws):
            return 'REVIEW'
        if '已写入' in text and '文件' in text:
            return 'FILE_WRITE'
        if '项目总结' in text:
            return 'SUMMARY'
        if '汇报结果' in text or '收到项目经理汇报' in text:
            return 'REPORT'
        return 'OTHER'

    def print_report(self, workspace_root, goal):
        elapsed = time.time() - self.start_time
        print()
        print("=" * 60)
        print("  执行报告")
        print("=" * 60)

        # 阶段统计
        phase_order = ['CEO_HANDOFF', 'REQUIREMENTS', 'ANALYSIS', 'PLANNING',
                       'DISCUSSION', 'INTEGRATION', 'ASSIGNMENT',
                       'EXECUTION', 'FILE_WRITE', 'REVIEW', 'REVIEW_PASS', 'REVIEW_FIX',
                       'SUMMARY', 'REPORT']
        passed = 0
        for p in phase_order:
            if p in self.phases:
                count = len(self.phases[p])
                print(f"    [OK]  {p} ({count} 条)")
                passed += 1
            else:
                print(f"    [--]  {p}")

        # 统计开发轮次
        exec_rounds = len(self.phases.get('EXECUTION', []))
        review_rounds = len(self.phases.get('REVIEW', []))
        fix_rounds = len(self.phases.get('REVIEW_FIX', []))
        file_writes = len(self.phases.get('FILE_WRITE', []))
        print(f"    开发轮次: {exec_rounds} 执行 / {review_rounds} 审查 / {fix_rounds} 修复")
        print(f"    文件写入通知: {file_writes} 条")
        print(f"    阶段通过: {passed}/{len(phase_order)}")

        # 文件统计
        workspace = Path(workspace_root)
        code_exts = {'.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.java', '.go', '.rs', '.c', '.cpp', '.sql', '.sh', '.yaml', '.yml', '.json', '.toml'}
        doc_exts = {'.md', '.txt', '.rst'}
        all_text_exts = code_exts | doc_exts
        all_files = [f for f in workspace.rglob("*") if f.is_file()]
        text_files = [f for f in all_files if f.suffix in all_text_exts]
        total_chars = 0
        code_count = 0
        doc_count = 0
        for f in text_files:
            try:
                content = f.read_text(encoding="utf-8")
                total_chars += len(content)
                rel = str(f.relative_to(workspace))
                has_cn = bool(re.search(r'[\u4e00-\u9fff]', content))
                ftype = "代码" if f.suffix in code_exts else "文档"
                if f.suffix in code_exts:
                    code_count += 1
                else:
                    doc_count += 1
                print(f"    [{ftype}] {rel} ({len(content)} 字{' [中文]' if has_cn else ''})")
            except:
                pass

        print()
        print_result("总消息数", len(self.messages))
        print_result("文件总数", len(text_files))
        print_result("代码文件", code_count)
        print_result("文档文件", doc_count)
        print_result("总字数", total_chars)
        print_result("耗时", f"{elapsed:.1f}s")
        print_result("输出目录", workspace_root)

        # 判断是否通过
        has_files = len(text_files) > 0
        has_code = code_count > 0
        has_substantial_content = total_chars > 500

        # 软件项目需要代码文件，其他项目需要内容文件
        profile_id = detect_team_profile(goal) if goal else "default"
        if profile_id == "software":
            ok = passed >= 8 and has_files and has_code and has_substantial_content
        else:
            ok = passed >= 8 and has_files and has_substantial_content
        print()
        if ok:
            print("    结果: 通过")
        else:
            reasons = []
            if passed < 8:
                reasons.append(f"阶段不完整({passed}/11)")
            if not has_files:
                reasons.append("无文件生成")
            if not has_substantial_content:
                reasons.append(f"内容不足({total_chars}字)")
            if profile_id == "software" and not has_code:
                reasons.append("缺少代码文件")
            print(f"    结果: 未通过 — {'; '.join(reasons)}")
        print("=" * 60)
        return ok


# ============================================================================
# 主流程
# ============================================================================

async def run(goal: str, team_size: int, api_key: str, base_url: str,
              provider: str, model_name: str, output_dir: str):
    print_banner()

    # 1. 自动检测团队
    profile_id = detect_team_profile(goal)
    profile = TEAM_PROFILES[profile_id]
    role_ids = profile["roles_6" if team_size == 6 else "roles_4"]

    print()
    print_phase("项目配置")
    print_result("目标", goal)
    print_result("团队", f"{profile['name']} ({team_size}人)")
    print_result("角色", ", ".join(role_ids))
    print_result("模型", f"{provider}/{model_name or '(默认)'}")
    if base_url:
        print_result("API", base_url)

    # 2. 加载配置
    print_phase("加载角色配置")
    roles_config = load_roles_config()
    if not roles_config:
        print("  错误: 无法加载 roles_config.yaml")
        return False
    print_result("基础角色", len(roles_config.get("base_roles", {})))
    print_result("自定义角色", len(roles_config.get("custom_roles", {})))
    print_result("技能定义", len(roles_config.get("skills", {})))

    # 3. 组装团队
    print_phase("组装团队")
    team = create_team_from_roles(role_ids, roles_config)
    for a in team:
        role = a["role"].value
        skills = ", ".join(a.get("capabilities", [])[:3])
        print(f"    {a['name']:12s} → {role:12s} ({skills})")

    # 4. 创建工作区
    print_phase("创建工作区")
    if output_dir:
        workspace_root = output_dir
        os.makedirs(workspace_root, exist_ok=True)
        workspace = type('W', (), {'root_path': workspace_root, 'workspace_id': 'custom'})()
    else:
        workspaces_base = os.environ.get(
            "AGENT_WORKSPACES_DIR",
            os.path.join(os.path.expanduser("~"), ".agent-workspaces")
        )
        mgr = WorkspaceManager(workspaces_dir=workspaces_base)
        workspace = mgr.create_workspace(
            task_id=f"project-{int(time.time())}",
            workspace_type=WorkspaceType.STANDALONE,
        )
        workspace_root = workspace.root_path
    print_result("目录", workspace_root)

    # 5. 执行
    print_phase("执行项目流程")
    tracker = MessageTracker()

    meeting = MeetingSession(f"project-{int(time.time())}")
    meeting.start(team_template=team)

    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        workspace=workspace,
        workflow_engine=WorkflowEngine(),
    )

    # 根据团队类型生成针对性任务描述
    profile_id = detect_team_profile(goal)
    if profile_id == "software":
        task_desc = (
            f"请围绕以下目标完成项目：\n"
            f"目标：{goal}\n\n"
            f"要求：\n"
            f"1. 先讨论方案和计划\n"
            f"2. 必须创建可运行的代码文件（如 app.py, index.html, style.css 等），不要只写文档\n"
            f"3. 每个代码文件必须包含完整的、可直接运行的代码，不能是空文件或占位符\n"
            f"4. 创建 README.md 说明如何运行项目\n"
            f"5. 请在代码块中使用文件名格式，如：```app.py\nfrom flask import Flask\n...\n```"
        )
    elif profile_id in ("novel", "content"):
        task_desc = (
            f"请围绕以下目标完成项目：\n"
            f"目标：{goal}\n\n"
            f"要求：\n"
            f"1. 先讨论方案和计划\n"
            f"2. 将正文内容以文件形式写入工作区（如 chapter_1.md, chapter_2.md 等）\n"
            f"3. 每个文件至少500字，包含完整的场景描写和对话\n"
            f"4. 创建 README.md 包含简介和目录\n"
            f"5. 请在代码块中使用文件名格式，如：```chapter_1.md\n正文内容...\n```"
        )
    else:
        task_desc = (
            f"请围绕以下目标完成项目：\n"
            f"目标：{goal}\n\n"
            f"要求：\n"
            f"1. 先讨论方案和计划\n"
            f"2. 执行并将成果以文件形式写入工作区\n"
            f"3. 文件内容要完整、有质量，不能是空文件\n"
            f"4. 请在代码块中使用文件名格式，如：```output.md\n内容...\n```"
        )

    try:
        result = await coordinator.process_user_message(task_desc, tracker.track)
        print()
        print(f"  流程完成: {result.get('type', 'unknown')}")
    except Exception as e:
        import traceback
        print(f"\n  异常: {type(e).__name__}: {str(e)[:200]}")
        traceback.print_exc()

    # 6. 报告
    return tracker.print_report(workspace_root, goal)


def parse_args():
    parser = argparse.ArgumentParser(
        description="智能体公司 - 交互式项目测试",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 交互模式
  python run_project.py --api-key sk-xxx

  # 直接指定目标
  python run_project.py --api-key sk-xxx --goal "三国谋士穿越到现代职场" --team 6

  # 指定模型和API
  python run_project.py --api-key sk-xxx --base-url https://api.deepseek.com --goal "写一个计算器程序"
""")
    parser.add_argument("--api-key", required=True, help="LLM API Key")
    parser.add_argument("--base-url", default="", help="LLM API Base URL")
    parser.add_argument("--provider", default="deepseek", help="模型提供商 (默认: deepseek)")
    parser.add_argument("--model", default="", help="模型名称")
    parser.add_argument("--goal", default="", help="项目目标（留空则交互输入）")
    parser.add_argument("--team", type=int, default=0, choices=[0, 4, 6],
                        help="团队规模: 4/6 (默认: 交互选择或自动)")
    parser.add_argument("--output-dir", default="", help="输出目录")
    return parser.parse_args()


def main():
    args = parse_args()

    # 交互输入
    goal = args.goal
    if not goal:
        print()
        goal = input("  请输入项目目标: ").strip()
        if not goal:
            print("  未输入目标，退出。")
            return 1

    team_size = args.team
    if team_size == 0:
        profile_id = detect_team_profile(goal)
        profile = TEAM_PROFILES[profile_id]
        default_size = 4
        raw = input(f"  选择团队规模 [4/6] (默认{default_size}): ").strip()
        team_size = int(raw) if raw in ("4", "6") else default_size

    try:
        success = asyncio.run(run(
            goal=goal,
            team_size=team_size,
            api_key=args.api_key,
            base_url=args.base_url,
            provider=args.provider,
            model_name=args.model,
            output_dir=args.output_dir,
        ))
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n  用户中断")
        return 130
    except Exception as e:
        print(f"\n  异常: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
