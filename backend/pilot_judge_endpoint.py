"""
LLM judge 端点真实 key 试点：验证 /api/assets/templates 在 ASSET_JUDGE_ENABLED=1 下
经真实 DeepSeek LLM 评测 → 员工 gate 确认 → 入库的端到端演示闭环。

T30 交付了 judge 接线（asset_judge 模块 + fail-closed + env 开关）+ 单测（fake judge）；
本试点用真实 key 验证端点级全链路：
  1. 启动后端 server（env: BACKEND_TOKEN/ASSET_JUDGE_ENABLED=1/DEEPSEEK_*）
  2. POST /api/assets/templates（好模板）→ 真实 LLM 评测 → 返回 asset_id/request_id
  3. GET /api/gates/pending → 确认 template:<asset_id> gate 发起
  4. POST /api/gates/{request_id}/decide (approved=true) → 员工批准
  5. GET /api/assets → 确认 status=approved 且 checks.judge_score 持久化
  6. 验收清单 + 退出码

运行方式：
  cd backend
  KEY=$(grep -E '^DEEPSEEK_API_KEY=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
  BASE=$(grep -E '^DEEPSEEK_BASE_URL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
  MODEL=$(grep -E '^DEEPSEEK_MODEL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
  /home/test/miniconda3/envs/agentscope/bin/python pilot_judge_endpoint.py \
    --api-key "$KEY" --base-url "$BASE" --model "$MODEL" --backend-dir .
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

TOKEN = "pilot-judge-token"
BASE_URL = "http://localhost:8765"
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


def http_json(method: str, path: str, body=None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


def run(args: argparse.Namespace) -> None:
    server_env = dict(os.environ)
    server_env.update({
        "BACKEND_TOKEN": TOKEN,
        "ASSET_JUDGE_ENABLED": "1",
        "DEEPSEEK_API_KEY": args.api_key,
        "DEEPSEEK_BASE_URL": args.base_url,
        "DEEPSEEK_MODEL": args.model,
    })
    server = subprocess.Popen(
        [sys.executable, os.path.join(args.backend_dir, "server.py")],
        env=server_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(30):
            try:
                with urllib.request.urlopen(f"{BASE_URL}/health", timeout=2):
                    break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError("server 未在 30s 内就绪")

        print("=" * 60)
        print("  LLM judge 端点真实试点（ASSET_JUDGE_ENABLED=1, 模型: %s）" % args.model)
        print("=" * 60)

        # 1. 模板固化提交（真实 LLM 评测）——team_id 带时间戳（每次运行独立，避免 duplicate 去重拦截重复标题）
        team_id = f"pilot-team-{int(time.time())}"
        resp = http_json("POST", "/api/assets/templates", {
            "team_id": team_id,
            "title": "会议纪要模板-端点试点",
            "content": GOOD_TEMPLATE,
            "approver": "emp-001",
        })
        ok1 = bool(resp.get("success")) and bool(resp.get("data", {}).get("asset_id")) and bool(resp.get("data", {}).get("request_id"))
        asset_id = resp.get("data", {}).get("asset_id", "")
        request_id = resp.get("data", {}).get("request_id", "")
        print(f"  提交结果: success={resp.get('success')} asset_id={asset_id} request_id={request_id}")
        checks1 = check("模板提交成功（真实 LLM 评测通过 → gate 发起）", ok1)

        # 2. pending gate 确认
        pending = http_json("GET", "/api/gates/pending")
        gate = next((r for r in pending if r.get("taskId") == asset_id), None)
        ok2 = gate is not None and gate.get("gateId") == f"template:{asset_id}"
        print(f"  pending gate: {gate if gate else '(未找到)'}")
        checks2 = check("gate 发起（template:<asset_id> 在 pending）", ok2,
                        f"gateId={gate.get('gateId') if gate else 'N/A'} approverName={gate.get('approverName') if gate else 'N/A'}")

        # 3. 员工批准
        decided = http_json("POST", f"/api/gates/{request_id}/decide", {"approved": True, "reason": "端点试点批准"})
        ok3 = decided.get("resolved") is True
        checks3 = check("员工批准（decide approved=true → resolved）", ok3, str(decided))

        # 4. 入库 + 评测结果持久化
        assets_resp = http_json("GET", f"/api/assets?team_id={team_id}")
        assets = assets_resp.get("data", []) if isinstance(assets_resp, dict) else assets_resp
        asset = next((a for a in assets if a.get("asset_id") == asset_id), None)
        ok4 = asset is not None and asset.get("status") == "approved"
        ok5 = asset is not None and asset.get("checks", {}).get("quality") is True and asset.get("judge_score") is not None
        print(f"  入库资产: status={asset.get('status') if asset else 'N/A'} "
              f"checks={asset.get('checks') if asset else 'N/A'} judge_score={asset.get('judge_score') if asset else 'N/A'}")
        checks4 = check("资产入库（status=approved）", ok4)
        checks5 = check("评测结果持久化（checks + judge_score 非空）", ok5,
                        f"judge_score={asset.get('judge_score') if asset else 'N/A'}")

        ok = all([checks1, checks2, checks3, checks4, checks5])
        print(f"\n{'=' * 60}\n  judge 端点真实试点结果: {'全部通过' if ok else '存在未通过项'}\n{'=' * 60}")
        raise SystemExit(0 if ok else 1)
    finally:
        server.send_signal(signal.SIGTERM)
        server.wait(timeout=10)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="LLM judge 端点真实 key 试点")
    p.add_argument("--api-key", required=True, help="DeepSeek API key")
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"))
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    p.add_argument("--backend-dir", default=".", help="backend 目录（含 server.py）")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
