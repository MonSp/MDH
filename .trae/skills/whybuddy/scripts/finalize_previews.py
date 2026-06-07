#!/usr/bin/env python3
"""完成前的视觉预览 GATE：真出图 + 核验（把"出图"塞进必跑校验链）。

为什么是 gate：agent 会跑校验类脚本，但常跳过"出图"这步。把出图做成
一个强制 gate（经 gate.py 记台账），agent 跑 gate 链时就会跑到它；
而且**没产出任何真实 .png 就退出非零**，gate 判不通过 → 必须处理，
不能再用占位糊弄过去。

自带默认端点/模型/key，默认真出图（与 batch_images 一致）。
默认从 docs/*.md 各出一张；也可传 prompts.txt。

用法（建议经 gate 跑，留台账）：
  python scripts/gate.py checks_ledger.json -- python scripts/finalize_previews.py
直接跑：
  python scripts/finalize_previews.py
  python scripts/finalize_previews.py prompts.txt
"""
from __future__ import annotations
import base64, hashlib, json, os, pathlib, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone

# Key/地址/模型 等默认值统一在 scripts/image_settings.py。
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import image_settings as S

RETRIES = 3   # 503/超时等临时错误的重试次数
BACKOFF = 5   # 重试退避基数(秒)：5,10,15


def _transient(exc):
    # 只对"快失败"(HTTP 5xx/429，几乎秒回)重试，重试划算；
    # 读超时这种"慢失败"不重试——10 分钟已够久，再等只是把等待翻倍。
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in (429, 500, 502, 503, 504)
    return False

LABEL = S.LABEL
DOCS = ["docs/requirements.md", "docs/design.md", "docs/tasks.md"]

import re as _re
def _slug(s):
    s = _re.sub(r"[^\w\u4e00-\u9fff]+", "_", s or "").strip("_")
    return s[:24] or "screen"


def dig(d, path):
    for p in path.split("."):
        d = d[int(p)] if p.isdigit() else d[p]
    return d


def load_cfg():
    cfg = S.load_config()
    st = S.resolve(cfg)
    return st


def collect_prompts(argv):
    # 1) 显式 prompts 文件优先
    if len(argv) > 1 and pathlib.Path(argv[1]).exists():
        items = []
        for line in pathlib.Path(argv[1]).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                items.append((f"img_{len(items):03d}", line))
        return items
    # 2) 模块驱动：从 spec_tree.json 按"每个需求(页面) + 它的设计 + 验收"各出一张
    sp = pathlib.Path("spec_tree.json")
    if sp.exists():
        try:
            tree = json.loads(sp.read_text(encoding="utf-8"))
            nodes = tree.get("nodes", [])
            product = ""
            roots = [n for n in nodes if n.get("parentId") in (None, "")]
            if roots:
                product = roots[0].get("title", "")
            cb = pathlib.Path("clarified_brief.json")
            if cb.exists():
                try:
                    product = json.loads(cb.read_text(encoding="utf-8")).get("goal") or product
                except Exception:
                    pass
            items = []
            for r in [n for n in nodes if n.get("type") == "requirement"]:
                designs = [d for d in nodes if d.get("type") == "design" and d.get("parentId") == r.get("id")]
                dnotes = "；".join(d.get("notes", "") for d in designs if d.get("notes"))
                acc = str(r.get("acceptance", ""))
                prompt = (f"为产品「{product}」的「{r.get('title')}」这个页面，生成一张 Web 界面草样(UI mockup)。"
                          f"该页面要能体现：{acc}。"
                          + (f"设计要点：{dnotes}。" if dnotes else "")
                          + "要求：画出真实的页面布局（顶部导航 + 主操作区 + 列表/卡片/侧栏等），"
                            "中文占位文案、只示意不写真实数据、右上角明显标注 PREVIEW。每个页面布局要各不相同。")
                items.append((f"screen_{r.get('id')}_{_slug(r.get('title'))}", prompt))
            if items:
                return items
        except Exception:
            pass
    # 3) 兜底：没有 spec_tree → 只出一张总览，绝不再一份文档一张地重复
    rq = pathlib.Path("docs/requirements.md")
    if rq.exists():
        txt = " ".join(rq.read_text(encoding="utf-8").split())[:300]
        return [("overview", f"为这个产品生成一张主界面草样(UI mockup)。要点：{txt}。中文占位、只示意、标注 PREVIEW。")]
    return []


def main():
    st = load_cfg()
    url, model, key, timeout = st.url, st.model, st.key, st.timeout
    body_tpl = st.body
    resp = st.response
    size = body_tpl.get("image_size", S.DEFAULT_BODY["image_size"])
    aspect = body_tpl.get("aspect_ratio", S.DEFAULT_BODY["aspect_ratio"])
    items = collect_prompts(sys.argv)
    out = pathlib.Path("previews"); out.mkdir(parents=True, exist_ok=True)
    if not items:
        print("没有可出图的来源（docs/*.md 不存在，也没给 prompts.txt）。", file=sys.stderr)
        return 1
    headers = st.headers()
    records = []; ok = 0
    print(f"出图 gate：模型={model} 端点={url} 共 {len(items)} 张")
    for name, prompt in items:
        rec = {"name": name, "prompt": prompt, "model": model, "label": LABEL,
               "ts": datetime.now(timezone.utc).isoformat(), "ok": False, "output": None, "error": None}
        body = {**body_tpl, "image_size": size, "aspect_ratio": aspect, "model": model, "prompt": prompt}
        for attempt in range(1, RETRIES + 1):
            try:
                req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    payload = json.loads(r.read().decode("utf-8"))
                target = out / f"{name}.{resp.get('ext', 'png')}"
                target.write_bytes(base64.b64decode(dig(payload, resp["path"])))
                rec["ok"] = True; rec["output"] = str(target); ok += 1
                print(f"  ✓ {target}"); break
            except Exception as exc:
                rec["error"] = str(exc)
                if attempt < RETRIES and _transient(exc):
                    wait = BACKOFF * attempt
                    print(f"  …{name} 第{attempt}次失败({exc})，{wait}s 后重试", file=sys.stderr)
                    time.sleep(wait); continue
                print(f"  ✗ {name}: {exc}", file=sys.stderr); break
        records.append(rec)
    (out / "provenance.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    produced = [pathlib.Path(r["output"]) for r in records if r.get("ok") and r.get("output")]
    pngs = list(out.glob("*.png"))
    print(f"出图 gate 结果：本次真实成功 {ok}/{len(items)} 张；previews/ 现有 {len(pngs)} 个 .png 文件")
    # 关键：gate 只认"本次真生成成功的张数"，不认"目录里有没有文件"——防复制/占位糊弄
    if ok == 0:
        print("❌ 本次没有任何一张真实生成成功（端点可能 503/超时，已重试仍失败）。", file=sys.stderr)
        print("   注意：previews/ 里就算有 .png 也不算数——这道闸看的是『本次是否真生成成功』，", file=sys.stderr)
        print("   不是『目录里有没有文件』。别用复制图/占位图糊弄；端点恢复后重跑即可。", file=sys.stderr)
        return 1
    if len(produced) >= 2:
        hashes = {hashlib.md5(p.read_bytes()).hexdigest() for p in produced if p.exists()}
        if len(hashes) == 1:
            print("❌ 多张预览图字节完全相同，疑似复制同一张充数、并非逐页真实生成——不通过。", file=sys.stderr)
            return 1
    if ok < len(items):
        print(f"⚠️ 部分失败：{len(items) - ok} 张没出成（见 provenance.json），不通过。", file=sys.stderr)
        return 1
    print("✓ 通过：previews/ 有逐页真实生成、且互不相同的图片。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
