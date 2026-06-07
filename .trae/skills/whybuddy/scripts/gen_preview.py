#!/usr/bin/env python3
"""WhyBuddy 视觉预览适配器（可插你自己的生图模型）。

把每份规格文档转成「界面草样」的生图提示词，再按 image_config.json 配置的后端出图：
  - dry_run : 只产出提示词，不调用任何模型（默认，离线可用）
  - http    : 通用 REST 调用（你填 url/headers/body_template/response 路径）
  - command : 调用你本地的生图 CLI
  - mcp     : 交给宿主端的生图 MCP 工具（脚本只产出提示词与工具名，由宿主/agent 调）

铁律（与 SKILL 一致）：
  - 生成图一律标「预览·未验证」并记录所用模型，写入 previews/provenance.json；
  - 架构总图/规格树不走这里，由 Mermaid 确定性渲染；
  - 密钥只从环境变量取（配置里用 ${ENV} 引用），不落盘；
  - 未配置 / 连不上 → 降级跳过，不阻塞主流程（退出码仍为 0）。

用法:
    python scripts/gen_preview.py image_config.json docs/requirements.md docs/design.md
"""
from __future__ import annotations
import base64, json, os, pathlib, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import image_settings as S

ENV_RE = re.compile(r"\$\{([A-Z0-9_]+)\}")


def interp(obj, mapping):
    if isinstance(obj, str):
        def repl(m):
            k = m.group(1)
            return mapping.get(k, os.environ.get(k, ""))
        return ENV_RE.sub(repl, obj)
    if isinstance(obj, dict):
        return {k: interp(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [interp(v, mapping) for v in obj]
    return obj


def dig(data, path):
    cur = data
    for part in path.split("."):
        if part.isdigit():
            cur = cur[int(part)]
        else:
            cur = cur[part]
    return cur


def build_prompt(cfg, title, text):
    excerpt = " ".join(text.split())[:400]
    tpl = cfg.get("prompt_template", "UI mockup for {title}: {excerpt}")
    return tpl.format(title=title, excerpt=excerpt)


def run_http(cfg, prompt, out_path):
    h = cfg["http"]
    to = int(cfg.get("timeout", 600))
    st = S.resolve(cfg)  # 统一的 key/model 取值（环境变量优先）
    mapping = {"PROMPT": prompt, "MODEL": st.model, "IMAGE_API_KEY": st.key}
    url = interp(h["url"], mapping)
    headers = interp(h.get("headers", {}), mapping)
    body = interp(h.get("body_template", {}), mapping)
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                 headers=headers, method=h.get("method", "POST"))
    with urllib.request.urlopen(req, timeout=to) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    rp = h["response"]
    val = dig(payload, rp["path"])
    ext = rp.get("ext", "png")
    target = out_path.with_suffix("." + ext)
    if rp.get("encoding") == "b64":
        target.write_bytes(base64.b64decode(val))
    else:  # url
        with urllib.request.urlopen(val, timeout=to) as ir:
            target.write_bytes(ir.read())
    return str(target)


def main(argv):
    if len(argv) < 3:
        print("用法: python scripts/gen_preview.py image_config.json <doc...>", file=sys.stderr)
        return 2
    try:
        cfg = json.loads(pathlib.Path(argv[1]).read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"配置读取失败，跳过视觉预览: {exc}", file=sys.stderr)
        return 0

    out_dir = pathlib.Path(cfg.get("out_dir", "previews"))
    out_dir.mkdir(parents=True, exist_ok=True)
    mode = cfg.get("mode", "dry_run")
    model = S.resolve(cfg).model
    label = cfg.get("label", "预览·未验证")
    records = []

    if not cfg.get("enabled", True):
        print("视觉预览未启用（enabled=false），跳过。")
        mode = "skipped"

    for raw in argv[2:]:
        p = pathlib.Path(raw)
        if not p.exists():
            continue
        title = p.stem
        prompt = build_prompt(cfg, title, p.read_text(encoding="utf-8"))
        rec = {"doc": str(p), "title": title, "model": model, "mode": mode,
               "prompt": prompt, "label": label,
               "ts": datetime.now(timezone.utc).isoformat(), "output": None, "note": ""}
        try:
            if mode == "dry_run" or mode == "skipped":
                pf = out_dir / f"{title}.prompt.txt"
                pf.write_text(prompt, encoding="utf-8")
                rec["output"] = str(pf); rec["note"] = "仅产出提示词，未调用模型"
            elif mode == "http":
                rec["output"] = run_http(cfg, prompt, out_dir / title)
            elif mode == "command":
                target = out_dir / f"{title}.png"
                argv_t = interp(cfg["command"]["argv"], {"PROMPT": prompt, "OUT": str(target), "MODEL": model})
                subprocess.run(argv_t, check=True)
                rec["output"] = str(target)
            elif mode == "mcp":
                pf = out_dir / f"{title}.mcp.json"
                pf.write_text(json.dumps({"tool": cfg.get("mcp", {}).get("tool"), "prompt": prompt},
                                         ensure_ascii=False, indent=2), encoding="utf-8")
                rec["output"] = str(pf); rec["note"] = "交宿主 MCP 工具生成"
            else:
                rec["note"] = f"未知 mode={mode}，跳过"
        except Exception as exc:  # 降级：记下失败但不阻塞
            rec["note"] = f"生图失败，降级跳过: {exc}"
        records.append(rec)

    prov = out_dir / "provenance.json"
    prov.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(1 for r in records if r["output"])
    print(f"视觉预览完成: {ok}/{len(records)} 件（mode={mode}, model={model or '—'}），均标「{label}」；详见 {prov}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
