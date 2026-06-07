# whybuddy skill（v2）

这是把"WhyBuddy Skill 闭环总图（改进版 v2 · 伴随式角色+落地交付）"落成到文件系统中的一个 Skill 包骨架。

## 包含内容

- `SKILL.md`：技能主说明
- `docs/architecture.mmd`：权威 Mermaid 图
- `docs/requirements.md`：需求说明
- `docs/design.md`：设计说明
- `docs/tasks.md`：落地任务
- `docs/prompt_pack.md`：执行提示骨架
- `docs/effect_preview.md`：效果预览说明
- `examples/handoff_manifest.json`：交付清单样例
- `scripts/*.py`：确定性校验与兜底脚本

## 定位

这个包不是完整运行时实现，而是 **WhyBuddy Skill 的方法论 + 产物契约 + 校验脚本**。
如果要接入真实产品，还需要宿主提供：

- artifact store
- event bus
- realtime store
- socket relay
- replay reader
- invalidation engine
- status deriver

## 快速校验

```bash
python3 scripts/fallback_tree.py "把闭环架构图做成 WhyBuddy Skill" > /tmp/spec_tree.json
python3 scripts/validate_spec_tree.py /tmp/spec_tree.json
python3 scripts/check_content_quality.py docs/requirements.md docs/design.md docs/tasks.md
```
