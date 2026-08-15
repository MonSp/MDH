"""注入 wiring 真实纪要试点：验证 M4 资产复用注入 seam 的接线生效。

预置演示团队资产（模板/知识/技能规则）→ MeetingCoordinator 绑定 build_asset_context
为 asset_context_builder → 真实纪要 DAG 运行（deepseek-chat）→ 验收：
①注入接线生效（节点 prompt 含资产参考段）；②生成结果产出；③无资产团队零成本。

接线链路（T1 + M4-T2 两个 wiring 点）：
  build_minutes_workflow(transcript, approver, team_id)   # T1：team_id → 节点 input_spec
    → WorkflowEngine._get_node_input 合并 input_spec → input_data["team_id"]
    → coordinator._asset_context_builder(team_id, "minutes", ["纪要", "待办"])  # M4-T2 seam
    → build_asset_context(store, extractor, ...) → "\n资产参考：\n..." 追加进节点 prompt

执行路径：直驱（同 pilot_minutes），但绕过 process_user_message——analyzer 内部
build_minutes_workflow(user_message) 单参调用无 team_id 通道（semantic_analyzer.py），
故直接 build_minutes_workflow(team_id=...) 构建 wf + coordinator._execute_workflow
（真实 LLM 节点执行，_execute_workflow_node 经引擎注册的 executor 调用）。

注入验证：_execute_workflow_node 的 prompt 在内部构造不直接暴露——实例级 wrapper 捕获：
  - 重注册 workflow_engine 的 dept-docs executor（构造时引擎已捕获原 bound 执行器，
    须重注册才生效）记录每节点 input_data.team_id；
  - 替换 coord._run_agent_execution_loop 实例属性（不绑定 self，运行时查找命中）
    记录每节点真实下发的 prompt（含"资产参考"则注入生效）。

运行方式（需真实 DEEPSEEK_API_KEY）：
  cd backend
  python pilot_asset_injection.py --api-key $DEEPSEEK_API_KEY \
      --base-url $DEEPSEEK_BASE_URL --model $DEEPSEEK_MODEL

验收清单（脚本末尾打印 PASS/FAIL）：
  1. 注入接线生效：预置团队 wf 3 节点 input_data.team_id 透传 + 3 节点 prompt 含"资产参考"段
  2. 生成结果产出：纪要 DAG（extract/draft/proofread）3 节点真实 LLM 结果非空
  3. 无资产团队零成本：builder 对空团队返回空串 + 空团队 wf 3 节点 prompt 均不含资产段

零成本对照顺序说明：运行 A（空团队）必须先于预置资产——技能规则检索
（ExperienceExtractor.retrieve_relevant_rules）现在同样按 team 严格隔离
（fail-closed：非空 team_id 只返回同团队规则），预置后再跑空团队会检索到
同 extractor 的规则导致误判；先验证空态再预置，才能干净地证明"builder 返回空不注入"。
"""

import argparse
import asyncio
import json
import os
import re
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(__file__))

from agent_toolset import load_roles_config
from asset_injection import build_asset_context
from asset_store import AssetStore
from experience_extractor import ExperienceExtractor
from meeting import MeetingSession, create_team_from_roles
from meeting_coordinator import MeetingCoordinator
from minutes_workflow import build_minutes_workflow
from skill_evolution import SkillEvolution
from workspace_manager import WorkspaceManager, WorkspaceType

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

TEAM_ID = "pilot-asset-team"          # 预置资产团队
EMPTY_TEAM_ID = "pilot-empty-team"    # 无资产团队（零成本对照）

TRANSCRIPT = (
    "今天的会议讨论了新产品发布计划：确定 8 月 15 日上线，"
    "市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。"
    "请把速记整理成会议纪要并生成待办清单。"
)

# 预置资产：结构化好模板（含要点/决策/待办三节，与 judge 试点同源）
GOOD_TEMPLATE = (
    "标题：会议纪要\n"
    "时间：2026-08-15\n"
    "参加人：市场部、研发部、销售部\n"
    "一、会议要点\n"
    "确定新产品 8 月 15 日上线，市场部负责宣传物料，研发部负责版本冻结。\n"
    "二、决策\n"
    "上线日期确定为 8 月 15 日，不做延期。\n"
    "三、待办\n"
    "市场部：完成宣传物料（责任人：李娜，截止 8 月 10 日）\n"
    "研发部：完成版本冻结（责任人：王强，截止 8 月 12 日）\n"
    "销售部：准备客户通知（责任人：张伟，截止 8 月 13 日）\n"
)

# 预置资产：好产出物（知识库）
GOOD_ARTIFACT = (
    "会议确定新产品 8 月 15 日上线。\n"
    "市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。\n"
    "所有待办均指定了责任人与截止日期。\n"
)

# 技能进化反馈：提炼 correction_tip 规则（keywords 命中注入检索）
EVOLVE_FEEDBACK = "审核修改：纪要待办需逐项指定责任人与截止日期。"


def parse_args():
    p = argparse.ArgumentParser(description="注入 wiring 真实纪要试点")
    p.add_argument("--api-key", required=True, help="DeepSeek API key")
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    p.add_argument("--provider", default="deepseek")
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", ""))
    return p.parse_args()


def banner(text):
    print(f"\n{'=' * 60}\n  {text}\n{'=' * 60}")


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


class MessageCollector:
    """收集 coordinator 消息（直驱路径 _msg 推送），防 emoji 崩溃。"""

    def __init__(self):
        self.messages = []

    async def collect(self, agent_id, text, delta=None, **kwargs):
        if isinstance(text, dict):
            text = json.dumps(text, ensure_ascii=False)
        safe = re.sub(r"[\U0001f300-\U0001f9ff]", "", text or "")
        self.messages.append({"agent_id": agent_id, "text": safe})


def seed_assets(store: AssetStore, extractor: ExperienceExtractor):
    """预置演示团队资产：好模板 + 好产出物 + 技能规则（经审核写入增量区）。"""
    store.store_artifact(TEAM_ID, "纪要-0815", GOOD_ARTIFACT, source_task_id="p1")
    store.propose_template(TEAM_ID, "会议纪要模板", GOOD_TEMPLATE, source_task_id="p1")
    evo = SkillEvolution(extractor).evolve_from_feedback(
        "p1", "minutes", TRANSCRIPT, EVOLVE_FEEDBACK, ["责任人", "行动项"],
        # T7 评审 Important 连带：不传 team_id 则规则 team_id=""，对预置团队的
        # 检索/注入段静默失效（模板/知识仍注入故验收不红，但规则项消失）
        team_id=TEAM_ID,
    )
    print(f"  已预置资产: 知识×1 + 模板×1 + 技能规则×{evo.get('count', 0)}（team={TEAM_ID}）")
    return evo.get("count", 0)


def install_capture(coord: MeetingCoordinator):
    """实例级 wrapper 捕获：节点 input_data.team_id + 真实下发的 prompt。

    返回 (node_captures, prompt_captures) 两个共享列表；每次 wf 运行后由调用方清空。
    """
    node_captures: list = []
    prompt_captures: list = []

    orig_exec = coord._execute_workflow_node  # bound method（构造时已注册进引擎的原执行器）
    async def wrapped_exec(node, input_data):
        node_captures.append({
            "node_id": node.node_id,
            "dept_id": node.dept_id,
            "team_id": (input_data or {}).get("team_id", ""),
        })
        return await orig_exec(node, input_data)

    # 引擎在 coordinator 构造时捕获了 bound 执行器——实例属性替换不生效，须重注册
    coord.workflow_engine.register_node_executor("dept-docs", wrapped_exec)

    orig_loop = coord._run_agent_execution_loop  # bound method
    async def wrapped_loop(model, prompt, agent_toolset, **kwargs):
        prompt_captures.append(prompt)
        return await orig_loop(model, prompt, agent_toolset, **kwargs)

    # 实例属性替换（不绑定 self）：_execute_workflow_node 运行时 self._run_agent_execution_loop
    # 查找实例属性即命中 wrapper——prompt 在内部构造，此处捕获真实下发的 prompt
    coord._run_agent_execution_loop = wrapped_loop

    return node_captures, prompt_captures


async def run_minutes_workflow(coord: MeetingCoordinator, team_id: str, collector: MessageCollector) -> dict:
    """构建带 team_id 的纪要 DAG 并走 coordinator._execute_workflow 执行（真实 LLM）。"""
    wf = build_minutes_workflow(TRANSCRIPT, approver="submitter", team_id=team_id)
    team_ids = [n.input_spec.get("team_id", "") for n in wf.nodes]
    print(f"\n[wf] team_id={team_id!r} 节点数={len(wf.nodes)} input_spec.team_id 透传={team_ids}")
    return await coord._execute_workflow(wf, collector.collect)


def extract_asset_section(prompt: str) -> str:
    """节选 prompt 中"资产参考"起头的注入段（供输出实证）。"""
    idx = prompt.find("资产参考")
    if idx == -1:
        return ""
    start = prompt.rfind("\n", 0, idx)
    return prompt[start + 1:][:400].replace("\n", " ⏎ ")


async def main():
    args = parse_args()
    banner("注入 wiring 真实纪要试点")

    ws_name = f"pilot-asset-injection-{int(time.time())}"
    ws_dir = os.path.join(DATA_DIR, "demo_workspaces", ws_name)
    os.makedirs(ws_dir, exist_ok=True)
    workspace_mgr = WorkspaceManager(workspaces_dir=ws_dir)
    workspace = workspace_mgr.create_workspace(task_id=ws_name, workspace_type=WorkspaceType.STANDALONE)
    print(f"工作区: {workspace.root_path}")

    roles_config = load_roles_config()
    team = create_team_from_roles(["coordinator", "planner", "executor", "reviewer", "monitor"], roles_config)
    print(f"团队: {len(team)} 人 — {', '.join(t['name'] for t in team)}")

    meeting = MeetingSession(f"pilot-asset-{int(time.time())}")
    meeting.start(team_template=team)

    results = []
    collector = None
    try:
        with tempfile.TemporaryDirectory() as tmp:
            # ── 资产存取（临时目录，with 块退出自动清理）──
            store = AssetStore(os.path.join(tmp, "assets"))
            extractor = ExperienceExtractor(os.path.join(tmp, "rules"))

            # ── coordinator 构造时经 M4-T2 seam 绑定 builder ──
            builder = lambda team_id, task_type, kw: build_asset_context(store, extractor, team_id, task_type, kw)
            # 把关非本试点范围：不注入 approval_manager（node gate 自动跳过）
            coordinator = MeetingCoordinator(
                meeting_session=meeting,
                provider=args.provider,
                model_name=args.model,
                api_key=args.api_key,
                base_url=args.base_url,
                workspace=workspace,
                asset_context_builder=builder,
            )
            collector = MessageCollector()
            coordinator._on_message = collector.collect
            coordinator._current_on_message = collector.collect

            node_captures, prompt_captures = install_capture(coordinator)

            # ── 运行 A：无资产团队（预置前——store/extractor 全空，零成本对照）──
            banner("运行 A：无资产团队（期望零成本——不注入）")
            t0 = time.time()
            wf_empty = await run_minutes_workflow(coordinator, EMPTY_TEAM_ID, collector)
            elapsed_empty = time.time() - t0
            print(f"完成，耗时 {elapsed_empty:.1f}s，status={wf_empty.get('status')}")
            prompts_empty = list(prompt_captures)  # 快照（3 节点 dept-docs）
            nodes_empty = list(node_captures)
            prompt_captures.clear()
            node_captures.clear()
            # 零成本直接验证：此时 store 无任何资产、extractor 无任何规则 → builder 必返回空串
            empty_ctx = build_asset_context(store, extractor, EMPTY_TEAM_ID, "minutes", ["纪要", "待办"])

            # ── 预置演示团队资产（运行 A 之后——规则检索为全局共享，须先验证空态）──
            seed_assets(store, extractor)

            # ── 运行 B：预置资产团队（期望注入生效）──
            banner("运行 B：预置资产团队（期望注入）")
            t0 = time.time()
            wf_seeded = await run_minutes_workflow(coordinator, TEAM_ID, collector)
            elapsed_seeded = time.time() - t0
            print(f"完成，耗时 {elapsed_seeded:.1f}s，status={wf_seeded.get('status')}")
            prompts_seeded = list(prompt_captures)  # 快照（3 节点 dept-docs）
            nodes_seeded = list(node_captures)
            print("\n[注入实证] 各节点 prompt 资产段节选:")
            for p in prompts_seeded:
                print(f"  - {extract_asset_section(p)}")

            banner("验收清单")
            # ① 注入接线生效（预置团队运行 B）
            team_ids_seen = {n["team_id"] for n in nodes_seeded}
            results.append(check(
                "①-1 team_id 透传：3 节点 input_data.team_id == 预置团队",
                len(nodes_seeded) == 3 and team_ids_seen == {TEAM_ID},
                f"nodes={[(n['node_id'], n['team_id']) for n in nodes_seeded]}",
            ))
            with_assets = [p for p in prompts_seeded if "资产参考" in p]
            results.append(check(
                "①-2 注入生效：3 节点 prompt 均含资产参考段",
                len(prompts_seeded) == 3 and len(with_assets) == 3,
                f"prompt_captured={len(prompts_seeded)} 含资产段={len(with_assets)}",
            ))
            marker_ok = all(("会议纪要模板" in p or "规则" in p) for p in with_assets)
            results.append(check(
                "①-3 注入内容来自预置资产（模板/规则关键词可见）",
                marker_ok,
                "资产段含「会议纪要模板」或「规则」",
            ))

            # ② 生成结果产出（真实 LLM，运行 B）
            wf_seeded_results = wf_seeded.get("results", {}) or {}
            non_empty = [nid for nid in ("extract", "draft", "proofread")
                         if str((wf_seeded_results.get(nid) or {}).get("result", "")).strip()]
            results.append(check(
                "② 纪要 3 节点产出非空",
                wf_seeded.get("status") == "completed" and len(non_empty) == 3,
                f"status={wf_seeded.get('status')} 非空节点={non_empty}",
            ))

            # ③ 无资产团队零成本（运行 A）
            results.append(check(
                "③-1 builder 对空团队返回空串",
                empty_ctx == "",
                f"len(empty_ctx)={len(empty_ctx)}",
            ))
            injected_empty = sum(1 for p in prompts_empty if "资产参考" in p)
            results.append(check(
                "③-2 空团队 wf 3 节点 prompt 均无资产段",
                len(prompts_empty) == 3 and injected_empty == 0,
                f"prompt_captured={len(prompts_empty)} 含资产段={injected_empty} nodes={len(nodes_empty)}",
            ))
            results.append(check(
                "③-3 空团队 wf 正常执行（零成本注入不破坏流程）",
                wf_empty.get("status") == "completed",
                f"status={wf_empty.get('status')}",
            ))
    except Exception as exc:  # noqa: BLE001 — 试点脚本需捕获并报告真实异常
        print(f"\n异常: {type(exc).__name__}: {str(exc)[:300]}")
        results.append(check("试点执行未抛异常", False, str(exc)[:200]))
    finally:
        print(f"\n工作区: {workspace.root_path}（保留供检查）")
        print(f"消息数: {len(collector.messages)}" if collector is not None else "消息数: -")

    summary_ok = all(results)
    print(f"\n{'=' * 60}\n  试点结果: {'全部通过' if summary_ok else '存在未通过项'}\n{'=' * 60}")
    raise SystemExit(0 if summary_ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
