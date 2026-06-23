"""
完整演示：项目创建 → 技能进化 → 新项目自动加载

运行方式：
  python backend/demo_full_cycle.py --api-key YOUR_KEY [--base-url https://api.deepseek.com]
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from experience_extractor import ExperienceExtractor
from workspace_manager import WorkspaceManager, WorkspaceType
from meeting import MeetingSession, create_team_from_roles
from meeting_coordinator import MeetingCoordinator
from agent_toolset import load_roles_config

# ──────────────────── 配置 ────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
EXPERIENCE_DIR = os.path.join(DATA_DIR, "experience")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--api-key", required=True)
    p.add_argument("--base-url", default="https://api.deepseek.com")
    p.add_argument("--provider", default="deepseek")
    p.add_argument("--model", default="")
    return p.parse_args()


# ──────────────────── 工具函数 ────────────────────

def banner(text):
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}\n")


def step(n, text):
    print(f"[Step {n}] {text}")


def info(text):
    print(f"  {text}")


# ──────────────────── 消息收集器 ────────────────────

class MessageCollector:
    def __init__(self):
        self.messages = []
        self.files_written = []
        self.evolution_rules = []

    async def collect(self, agent_id, text, delta, **kwargs):
        safe = re.sub(r'[\U0001f300-\U0001f9ff]', '', text)
        self.messages.append({"agent_id": agent_id, "text": safe})

        # 检测文件写入
        write_match = re.search(r'\[写入文件\]\s*(.+?)\s*\((\d+)\s*字符\)', safe)
        if write_match:
            paths = write_match.group(1).split(',')
            for p in paths:
                p = p.strip()
                if p and p not in self.files_written:
                    self.files_written.append(p)

        # 检测技能进化
        evo_match = re.search(r'已提取\s*(\d+)\s*条经验规则', safe)
        if evo_match:
            self.evolution_rules.append(int(evo_match.group(1)))

        # 打印关键消息
        is_key = any(kw in safe for kw in [
            '项目经理', 'CEO', '讨论', '审查', '执行任务', '分派',
            '写入文件', '总结', '汇报', '经验规则', '已提取',
        ])
        if is_key and len(safe) < 200:
            print(f"    [{agent_id}] {safe[:120]}")


# ──────────────────── 运行项目 ────────────────────

async def run_project(title, task_desc, api_key, base_url, provider, model_name, project_tag):
    """运行一个完整项目，返回收集器"""
    banner(title)

    collector = MessageCollector()

    # 创建工作区（每个项目独立子目录，用tag区分）
    ws_name = f"demo-{project_tag}-{int(time.time())}"
    ws_dir = os.path.join(DATA_DIR, "demo_workspaces", ws_name)
    if os.path.exists(ws_dir):
        import shutil
        shutil.rmtree(ws_dir, ignore_errors=True)
    os.makedirs(ws_dir, exist_ok=True)
    workspace_mgr = WorkspaceManager(workspaces_dir=ws_dir)
    workspace = workspace_mgr.create_workspace(
        task_id=ws_name,
        workspace_type=WorkspaceType.STANDALONE,
    )
    info(f"工作区: {workspace.root_path}")

    # 创建团队
    roles_config = load_roles_config()
    team = create_team_from_roles(["coordinator", "planner", "executor", "reviewer", "monitor"], roles_config)
    info(f"团队: {len(team)} 人 — {', '.join(t['name'] for t in team)}")

    # 创建会议
    meeting = MeetingSession(f"demo-{int(time.time())}")
    meeting.start(team_template=team)

    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        workspace=workspace,
    )

    # 执行
    info(f"任务: {task_desc[:80]}...")
    info("开始执行...\n")

    try:
        result = await coordinator.process_user_message(task_desc, collector.collect)
        info(f"\n结果类型: {result.get('type', 'unknown')}")
    except Exception as e:
        info(f"\n异常: {type(e).__name__}: {str(e)[:200]}")
        result = {}

    info(f"消息数: {len(collector.messages)}")
    info(f"写入文件: {len(collector.files_written)}")
    if collector.files_written:
        for f in collector.files_written[:10]:
            info(f"  - {f}")
    info(f"技能进化规则: {sum(collector.evolution_rules)} 条")

    return collector, result, workspace.root_path


# ──────────────────── 技能进化流程 ────────────────────

def demo_skill_evolution():
    """演示技能进化：查看待审核规则 → 全部采纳"""
    banner("Step 2: 技能进化 — 审核经验规则")

    extractor = ExperienceExtractor(incremental_dir=EXPERIENCE_DIR)

    # 获取待审核规则
    pending = extractor.get_pending_rules()
    info(f"待审核规则: {len(pending)} 条\n")

    if not pending:
        info("无待审核规则，跳过")
        return

    for i, rule in enumerate(pending, 1):
        info(f"规则 {i}: [{rule.rule_type}]")
        info(f"  条件: {rule.trigger_condition}")
        info(f"  建议: {rule.action[:80]}")
        info(f"  关键词: {', '.join(rule.keywords[:5])}")
        info("")

    # 全部采纳
    info("全部采纳...")
    for rule in pending:
        extractor.approve_rule(rule.rule_id)

    # 验证
    approved = extractor.get_all_rules(status="approved")
    info(f"已采纳: {len(approved)} 条")


# ──────────────────── 验证规则注入 ────────────────────

def demo_verify_injection(task_desc):
    """验证采纳的规则会在下次执行时注入"""
    banner("Step 3: 验证规则自动注入")

    extractor = ExperienceExtractor(incremental_dir=EXPERIENCE_DIR)

    # 推断任务类型
    task_type = extractor._infer_task_type(task_desc)
    info(f"任务类型: {task_type}")

    # 提取关键词
    keywords = list(extractor._extract_content_keywords(task_desc))
    info(f"任务关键词: {', '.join(keywords[:10])}")

    # 检索相关规则
    rules = extractor.retrieve_relevant_rules(task_type, keywords)
    info(f"匹配规则: {len(rules)} 条\n")

    for r in rules:
        info(f"  [{r.rule_type}] {r.action[:80]}")

    # 构建注入上下文
    context = extractor.build_experience_context(rules)
    info(f"\n注入上下文: {len(context)} 字符")
    if context:
        info("预览:")
        for line in context.split('\n')[:12]:
            info(f"  {line}")

    return len(rules) > 0


# ──────────────────── 主流程 ────────────────────

async def main():
    args = parse_args()

    banner("智能体公司 — 完整周期演示")
    info(f"模型: {args.provider}/{args.model or '(默认)'}")
    info(f"API: {args.base_url}")

    # ── Step 1: 第一个项目 ──
    step(1, "运行第一个项目：Python Flask Web 应用")
    collector1, result1, ws_path = await run_project(
        title="项目 A: Python Flask Web 应用",
        task_desc="创建一个Python Flask Web应用，包含用户注册登录API和SQLite数据库，要有README文档",
        api_key=args.api_key,
        base_url=args.base_url,
        provider=args.provider,
        model_name=args.model,
        project_tag="flask",
    )

    # ── Step 2: 技能进化 ──
    step(2, "审核技能进化规则")
    demo_skill_evolution()

    # ── Step 3: 验证注入 ──
    step(3, "验证规则自动注入到新项目")
    injected = demo_verify_injection("开发一个Python FastAPI后端服务，实现RESTful接口")

    # ── Step 4: 第二个项目（应自动加载经验） ──
    step(4, "运行第二个项目（应自动加载历史经验）")
    collector2, result2, ws_path2 = await run_project(
        title="项目 B: Python FastAPI 后端（应注入历史经验）",
        task_desc="开发一个Python FastAPI后端服务，实现RESTful接口，包含数据库操作和错误处理",
        api_key=args.api_key,
        base_url=args.base_url,
        provider=args.provider,
        model_name=args.model,
        project_tag="fastapi",
    )

    # ── 最终报告 ──
    banner("最终报告")
    info(f"项目A: {len(collector1.messages)} 条消息, {len(collector1.files_written)} 个文件")
    info(f"项目B: {len(collector2.messages)} 条消息, {len(collector2.files_written)} 个文件")
    info(f"技能进化规则注入: {'是' if injected else '否'}")
    info(f"项目A输出: {ws_path}")
    info(f"项目B输出: {ws_path2}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
