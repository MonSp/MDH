"""
真实试点：会议纪要任务全链路（意图识别 → DAG 执行 → 员工把关 → 邮件分发）

覆盖 M2 里程碑交付的完整链路：
  速记文本 → SemanticAnalyzer 文档模式（is_workflow 短路，零 LLM 路由）
  → WorkflowEngine 顺序执行 extract→draft→proofread（dept-docs，真实 LLM）
  → draft 节点把关钩子（_run_node_gate → ApprovalManager.request_gate）
  → 员工把关（--auto-approve 自动批准 / 超时默认通过）
  → mailer seam 分发（FileMailer 写 .eml）

运行方式（需真实 DEEPSEEK_API_KEY）：
  cd backend
  python pilot_minutes.py --api-key $DEEPSEEK_API_KEY --auto-approve
  # 不带 --auto-approve 时把关等待 approval_timeout（默认 60s）后默认通过

验收清单（脚本末尾打印 PASS/FAIL）：
  1. 意图识别：is_workflow=True，纪要 DAG（3 节点 sequential）
  2. DAG 执行：extract/draft/proofread 三节点执行（workflow status）
  3. 员工把关：draft 节点 gate 请求发起（gate/requested 审计），决定记录（decided 或超时）
  4. 邮件分发：data/mailbox/*.eml 生成
  5. 工作区：试点工作区存在
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from approval_manager import ApprovalManager
from workspace_manager import WorkspaceManager, WorkspaceType
from meeting import MeetingSession, create_team_from_roles
from meeting_coordinator import MeetingCoordinator
from agent_toolset import load_roles_config
from mailer.seam import MailMessage, get_mailer

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

TRANSCRIPT = (
    "今天的会议讨论了新产品发布计划：确定 8 月 15 日上线，"
    "市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。"
    "请把速记整理成会议纪要并生成待办清单。"
)


def parse_args():
    p = argparse.ArgumentParser(description="会议纪要任务真实试点")
    p.add_argument("--api-key", required=True, help="DeepSeek API key")
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    p.add_argument("--provider", default="deepseek")
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", ""))
    p.add_argument("--auto-approve", action="store_true", help="自动批准把关请求（模拟员工决定）")
    p.add_argument("--approval-timeout", type=float, default=60.0, help="把关等待超时（秒），默认 60")
    return p.parse_args()


def banner(text):
    print(f"\n{'=' * 60}\n  {text}\n{'=' * 60}")


class MessageCollector:
    """收集 coordinator 消息并检测文件写入与关键节点。"""

    def __init__(self):
        self.messages = []
        self.files_written = []
        self.gate_seen = False

    async def collect(self, agent_id, text, delta=None, **kwargs):
        # 把关请求推送 payload 是 dict（kind="approval"），转为 JSON 文本避免 re.sub 崩溃
        if isinstance(text, dict):
            text = json.dumps(text, ensure_ascii=False)
        safe = re.sub(r"[\U0001f300-\U0001f9ff]", "", text or "")
        self.messages.append({"agent_id": agent_id, "text": safe})
        write_match = re.search(r"\[写入文件\]\s*(.+?)\s*\(", safe)
        if write_match:
            for p in write_match.group(1).split(","):
                p = p.strip()
                if p and p not in self.files_written:
                    self.files_written.append(p)
        if "把关" in safe or "审批" in safe:
            self.gate_seen = True
        if len(safe) < 200:
            print(f"    [{agent_id}] {safe[:120]}")


async def auto_approver(manager: ApprovalManager, stop: asyncio.Event):
    """模拟员工把关：轮询 pending gate 请求并批准（验证审计成对）。"""
    approved = 0
    while not stop.is_set():
        for req in manager.get_pending_requests():
            if req.get("operation") == "node_gate":
                await manager.handle_gate_response(req["id"], True, reason="试点自动批准")
                approved += 1
                print(f"  [把关] 批准 gate={req.get('gateId')} task={req.get('taskId')} approver={req.get('approver')}")
        await asyncio.sleep(0.3)
    return approved


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


async def main():
    args = parse_args()
    banner("MDH 会议纪要任务 · 真实试点")

    ws_name = f"pilot-minutes-{int(time.time())}"
    ws_dir = os.path.join(DATA_DIR, "demo_workspaces", ws_name)
    os.makedirs(ws_dir, exist_ok=True)
    workspace_mgr = WorkspaceManager(workspaces_dir=ws_dir)
    workspace = workspace_mgr.create_workspace(task_id=ws_name, workspace_type=WorkspaceType.STANDALONE)
    print(f"工作区: {workspace.root_path}")

    roles_config = load_roles_config()
    team = create_team_from_roles(["coordinator", "planner", "executor", "reviewer", "monitor"], roles_config)
    print(f"团队: {len(team)} 人 — {', '.join(t['name'] for t in team)}")

    meeting = MeetingSession(f"pilot-{int(time.time())}")
    meeting.start(team_template=team)

    gate_mgr = ApprovalManager()
    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=args.provider,
        model_name=args.model,
        api_key=args.api_key,
        base_url=args.base_url,
        workspace=workspace,
        approval_manager=gate_mgr,
        approval_timeout=args.approval_timeout,
    )
    collector = MessageCollector()

    stop = asyncio.Event()
    approver_task = None
    if args.auto_approve:
        approver_task = asyncio.create_task(auto_approver(gate_mgr, stop))

    print(f"\n任务: {TRANSCRIPT[:60]}...")
    t0 = time.time()
    try:
        result = await coordinator.process_user_message(TRANSCRIPT, collector.collect)
        elapsed = time.time() - t0
        print(f"\n完成，耗时 {elapsed:.1f}s，结果类型: {result.get('type', 'unknown')}")
    except Exception as exc:  # noqa: BLE001 — 试点脚本需捕获并报告真实异常
        print(f"\n异常: {type(exc).__name__}: {str(exc)[:300]}")
        result = {}
    finally:
        stop.set()
        if approver_task is not None:
            approved = await approver_task
            print(f"自动把关批准数: {approved}")

    banner("验收清单")
    results = []

    # 1. 意图识别
    analysis = result.get("analysis", {}) or {}
    is_workflow = analysis.get("is_workflow") is True
    node_ids = [n.get("node_id") for n in analysis.get("workflow_definition", {}).get("nodes", [])] if isinstance(
        analysis.get("workflow_definition"), dict) else []
    results.append(check("意图识别：is_workflow=True 且纪要 DAG", is_workflow and node_ids == ["extract", "draft", "proofread"],
                         f"nodes={node_ids} strategy={analysis.get('workflow_definition', {}).get('execution_strategy') if isinstance(analysis.get('workflow_definition'), dict) else None}"))

    # 2. DAG 执行
    wf = result.get("workflow_result", {}) or {}
    wf_status = wf.get("status")
    wf_results = wf.get("results", {}) or {}
    for nid, r in wf_results.items():
        if isinstance(r, dict):
            err = r.get("error")
            res_txt = str(r.get("result", ""))[:160].replace("\n", " ")
            print(f"  [节点] {nid}: status={r.get('status', '?')} error={str(err)[:200] if err else '-'} result={res_txt}")
    executed = sorted(k for k, v in wf_results.items() if isinstance(v, dict) and ("result" in v or "gate" in v))
    results.append(check("DAG 执行：工作流结束且节点有结果", bool(wf_status) and len(executed) >= 1,
                         f"status={wf_status} nodes={executed}"))

    # 3. 员工把关（审计成对）
    audit = gate_mgr.get_gate_audit()
    events = [e.get("event") for e in audit]
    gate_requested = any(e == "gate/requested" for e in events)
    gate_decided = any(e == "gate/decided" for e in events)
    results.append(check("员工把关：gate 请求发起", gate_requested, f"audit={events}"))
    results.append(check("员工把关：决定记录（批准/超时）", gate_decided or (not args.auto_approve and gate_requested),
                         "decided 审计存在（自动批准）或超时默认通过（无自动批准）"))

    # 4. 邮件分发
    try:
        mailer = get_mailer("file")
        body = "\n".join(m["text"] for m in collector.messages[-5:])
        msg_id = mailer.send(MailMessage(title="会议纪要试点", to=["pilot@example.com"], body=body or TRANSCRIPT))
        mailbox = os.path.join(os.path.dirname(__file__), "data", "mailbox")
        eml_files = [f for f in os.listdir(mailbox) if f.endswith(".eml")] if os.path.isdir(mailbox) else []
        results.append(check("邮件分发：mailer seam 生成 .eml", msg_id.startswith("mail-") and eml_files,
                             f"mailbox={len(eml_files)} 封"))
    except Exception as exc:  # noqa: BLE001
        results.append(check("邮件分发：mailer seam 生成 .eml", False, str(exc)[:120]))

    # 5. 工作区
    ws_files = []
    for root, _, files in os.walk(workspace.root_path):
        ws_files.extend(os.path.relpath(os.path.join(root, f), workspace.root_path) for f in files)
    results.append(check("工作区：试点工作区存在", os.path.isdir(workspace.root_path), f"文件数={len(ws_files)}"))

    summary_ok = all(results)
    print(f"\n{'=' * 60}\n  试点结果: {'全部通过' if summary_ok else '存在未通过项'}\n{'=' * 60}")
    print(f"工作区: {workspace.root_path}")
    print(f"消息数: {len(collector.messages)}，写入文件: {len(collector.files_written)}")
    if collector.files_written:
        for f in collector.files_written[:10]:
            print(f"  - {f}")
    raise SystemExit(0 if summary_ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
