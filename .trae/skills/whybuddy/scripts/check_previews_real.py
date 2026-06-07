#!/usr/bin/env python3
"""审计 previews 里的图是不是"真生成"的——**由你自己跑**，agent 改不了你这一步。

它读 previews/provenance.json + 图片本身，揪出三类"假装出图成功"：
  1) model 里含兜底标记(fallback/placeholder/mock/deterministic/local/synthetic)
     —— 本地画占位图冒充真生成（就是"超时就画线框图"那种）。
  2) ok:True 但 error 非空（尤其 timeout / 503）—— 标了成功其实没成。
  3) 多张图字节完全相同 —— 复制一张充数；或单张过小 —— 疑似占位骨架。

命中任一即判可疑、退出非零。诚实边界：它能查"标记/重复/失败痕迹"，
查不了"这张图画得好不好"——但"是不是真端点出的"基本能兜住。

用法: python scripts/check_previews_real.py [previews目录]   # 默认 previews
"""
import hashlib, json, pathlib, sys

SUSPECT = ("fallback", "placeholder", "mock", "deterministic", "local", "synthetic", "stub")


def main(argv):
    d = pathlib.Path(argv[1] if len(argv) > 1 else "previews")
    prov = d / "provenance.json"
    bad = []
    recs = []
    if prov.exists():
        try:
            recs = json.loads(prov.read_text(encoding="utf-8"))
        except Exception as e:
            bad.append(f"provenance.json 解析失败: {e}")
    else:
        bad.append("缺 provenance.json——无法核验来源")

    for r in recs:
        name = r.get("name", "?"); model = str(r.get("model", "")).lower(); err = r.get("error")
        if any(s in model for s in SUSPECT):
            bad.append(f"{name}: model 含兜底标记「{r.get('model')}」——本地占位冒充真生成")
        if r.get("ok") and err:
            bad.append(f"{name}: 标了 ok:True 但 error 非空「{str(err)[:50]}」——其实没成功")

    imgs = sorted(list(d.glob("*.png")) + list(d.glob("*.jpg")) + list(d.glob("*.jpeg")))
    seen = {}
    for p in imgs:
        b = p.read_bytes()
        seen.setdefault(hashlib.md5(b).hexdigest(), []).append(p.name)
        if len(b) < 5000:
            bad.append(f"{p.name}: 仅 {len(b)} 字节，过小，疑似占位骨架")
    for names in seen.values():
        if len(names) > 1:
            bad.append(f"字节完全相同(疑似复制充数): {', '.join(names)}")

    if bad:
        print("⚠️ 这批预览图不像全是真生成的：")
        for x in bad:
            print("  -", x)
        print("\n建议：端点健康时用 `python scripts/batch_images.py prompts.txt` 重新真出图。")
        return 1
    print(f"✓ {len(imgs)} 张图通过审计：无兜底标记、无假成功、无复制、尺寸正常。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
