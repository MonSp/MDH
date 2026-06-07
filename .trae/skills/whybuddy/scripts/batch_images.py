#!/usr/bin/env python3
"""WhyBuddy 批量生图（独立、自带默认、默认真出图）。

为什么自带默认：宿主 agent 常把 image_config.json 重置成 dry_run 空壳，
导致只出提示词、不出图。本脚本即使读到空配置、或根本没有配置，
也用内置默认端点 + 模型出图。**默认就是真出图**，只有显式 --dry-run 才只产提示词。

用法：
  python scripts/batch_images.py prompts.txt                  # 真出图（内置默认 + 内置测试key）
  python scripts/batch_images.py -p "一句提示词"               # 内联，可多个 -p
  python scripts/batch_images.py prompts.txt --dry-run        # 只产提示词、不调用
  python scripts/batch_images.py prompts.txt --config image_config.json  # 用配置覆盖默认

key 取值顺序：环境变量 IMAGE_API_KEY > --key > 配置 api_key > 内置测试key
退出码：全成功=0；全失败/部分失败=1；dry-run=0。
"""
from __future__ import annotations
import argparse, base64, json, os, pathlib, sys, time, urllib.request
from datetime import datetime, timezone

# Key/地址/模型 等默认值统一在 scripts/image_settings.py，这里不再各自硬编码。
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import image_settings as S

LABEL = S.LABEL


def dig(data, path):
    cur = data
    for part in path.split("."):
        cur = cur[int(part)] if part.isdigit() else cur[part]
    return cur


def load_prompts(source, inline):
    cand = ([source] if source else []) + list(inline or [])
    if len(cand) == 1 and pathlib.Path(cand[0]).suffix in (".txt", ".json") and pathlib.Path(cand[0]).exists():
        src = pathlib.Path(cand[0]); items = []
        if src.suffix == ".json":
            for i, it in enumerate(json.loads(src.read_text(encoding="utf-8"))):
                items.append({"name": it.get("name", f"img_{i:03d}"), "prompt": it["prompt"]} if isinstance(it, dict)
                             else {"name": f"img_{i:03d}", "prompt": str(it)})
        else:
            for line in src.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    items.append({"name": f"img_{len(items):03d}", "prompt": line})
        return items
    return [{"name": f"img_{i:03d}", "prompt": p} for i, p in enumerate(cand)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="prompts.txt / prompts.json，或直接一句提示词")
    ap.add_argument("--prompt", "-p", action="append", default=[], help="内联提示词，可重复 -p")
    ap.add_argument("--config", default="image_config.json", help="可选；存在则用它覆盖默认端点/模型/key")
    ap.add_argument("--out", default="previews/batch")
    ap.add_argument("--model", default="")
    ap.add_argument("--size", default="")
    ap.add_argument("--key", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--timeout", type=int, default=0, help="读超时秒数,默认300")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # 读配置（可选）——只拿来覆盖默认，绝不让它把模式压成 dry_run
    cfg = S.load_config(args.config)
    st = S.resolve(cfg, cli_model=args.model, cli_key=args.key, cli_size=args.size,
                   cli_timeout=args.timeout)
    url, model, key = st.url, st.model, st.key
    resp = st.response
    base_body = st.body

    items = load_prompts(args.source, args.prompt)
    if args.limit:
        items = items[: args.limit]
    if not items:
        print("没有可用的 prompt（给个 prompts.txt 或 -p \"...\"）。", file=sys.stderr)
        return 2

    TIMEOUT = st.timeout
    out_dir = pathlib.Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    headers = st.headers()
    records = []; ok = 0
    mode = "dry_run" if args.dry_run else "http"
    print(f"模式={mode} | 模型={model} | 端点={url} | 共 {len(items)} 条")

    for idx, it in enumerate(items):
        rec = {"name": it["name"], "prompt": it["prompt"], "model": model, "mode": mode,
               "ts": datetime.now(timezone.utc).isoformat(), "ok": False, "output": None,
               "label": LABEL, "error": None}
        if args.dry_run:
            pf = out_dir / f"{it['name']}.prompt.txt"; pf.write_text(it["prompt"], encoding="utf-8")
            rec["output"] = str(pf); rec["note"] = "dry-run，未调用模型"
            print(f"[dry {idx+1}/{len(items)}] {pf}")
            records.append(rec); continue
        try:
            body = {**base_body, "model": model, "prompt": it["prompt"]}
            req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                payload = json.loads(r.read().decode("utf-8"))
            val = dig(payload, resp["path"]); target = out_dir / f"{it['name']}.{resp.get('ext','png')}"
            if resp.get("encoding") == "b64":
                target.write_bytes(base64.b64decode(val))
            else:
                with urllib.request.urlopen(val, timeout=TIMEOUT) as ir:
                    target.write_bytes(ir.read())
            rec["ok"] = True; rec["output"] = str(target); ok += 1
            print(f"[{idx+1}/{len(items)}] ✓ {target}")
        except Exception as exc:
            rec["error"] = str(exc)
            print(f"[{idx+1}/{len(items)}] ✗ {it['name']}: {exc}", file=sys.stderr)
        records.append(rec)
        if args.delay:
            time.sleep(args.delay)

    (out_dir / "provenance.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成: {ok}/{len(items)} 张，均标「{LABEL}」；详见 {out_dir}/provenance.json")
    if args.dry_run:
        return 0
    if ok == 0:
        print("❌ 全部失败，没有任何图片产出（见 provenance.json 的 error）。", file=sys.stderr); return 1
    if ok < len(items):
        print(f"⚠️ 部分失败：{len(items)-ok} 条没出图。", file=sys.stderr); return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
