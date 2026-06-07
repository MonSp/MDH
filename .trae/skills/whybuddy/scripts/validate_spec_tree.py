#!/usr/bin/env python3
"""WhyBuddy 规格树不变量校验器（v2）。

对应架构图「Schema 校验 → 不变量守卫」。这些性质是确定性的，
必须由代码检查，而不是靠模型主观判断。

v2 新增（对应改进版架构）：
  - 需求覆盖：每条 successCriteria 必须被至少一个 requirement 覆盖；需求不许塌缩成一个。
  - EARS 验收：每个 requirement 的 acceptance 必须是 EARS 句式（触发条件 + SHALL/应）。
  - 证据贯穿：每个 requirement/design 必须挂 evidenceRefs，指向 source 非空的 evidence 节点。

诚实边界：脚本能查「挂没挂证据、source 是否非空、句式对不对」，
查不了「source 是不是真的、验收写得对不对」——那是接地者读真仓库 + 人审的事。

用法:
    python scripts/validate_spec_tree.py spec_tree.json
    cat spec_tree.json | python scripts/validate_spec_tree.py
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any

VALID_TYPES = {"requirement", "design", "task", "evidence"}
VALID_SOURCES = {"llm", "llm_fallback", "template"}
MIN_NODES = 3
MAX_NODES = 60
MAX_DEPTH = 4

EARS_EN_MODAL = re.compile(r"\bSHALL\b", re.I)
EARS_EN_TRIG = re.compile(r"\b(WHEN|WHILE|IF|WHERE)\b", re.I)
EARS_ZH_MODAL = re.compile(r"(应当|应|须|必须)")
EARS_ZH_TRIG = re.compile(r"(每当|一旦|当|若|如果|在|则)")


def is_ears(text: str) -> bool:
    if not text:
        return False
    if EARS_EN_MODAL.search(text) and EARS_EN_TRIG.search(text):
        return True
    if EARS_ZH_MODAL.search(text) and EARS_ZH_TRIG.search(text):
        return True
    return False


def load_payload(argv: list[str]) -> dict[str, Any]:
    if len(argv) > 1:
        with open(argv[1], "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    else:
        payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("输入必须是对象，且至少包含 nodes 或根级字段")
    return payload


def is_root(node: dict[str, Any]) -> bool:
    return node.get("parentId") in (None, "")


def validate(payload: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    nodes = payload.get("nodes")
    if not isinstance(nodes, list):
        return ["缺少 nodes 列表"]

    if not (MIN_NODES <= len(nodes) <= MAX_NODES):
        failures.append(f"节点数 {len(nodes)} 不在 [{MIN_NODES}, {MAX_NODES}] 之间")

    ids = [node.get("id") for node in nodes]
    if any(node_id in (None, "") for node_id in ids):
        failures.append("存在空节点 id")
    if len(ids) != len(set(ids)):
        duplicates = sorted({nid for nid in ids if ids.count(nid) > 1})
        failures.append(f"存在重复节点 id: {duplicates}")

    by_id = {node.get("id"): node for node in nodes}
    reqs = [n for n in nodes if n.get("type") == "requirement"]
    evidence_ids = {n.get("id") for n in nodes if n.get("type") == "evidence"}

    roots = [node for node in nodes if is_root(node)]
    if len(roots) != 1:
        failures.append(f"根节点数量必须为 1，实际为 {len(roots)}")
    elif roots[0].get("type") != "requirement":
        failures.append("根节点类型必须为 requirement")

    for node in nodes:
        node_type = node.get("type")
        if node_type not in VALID_TYPES:
            failures.append(f"节点 {node.get('id')!r} 类型非法: {node_type!r}")
        if not is_root(node) and node.get("parentId") not in by_id:
            failures.append(f"节点 {node.get('id')!r} 的父节点 {node.get('parentId')!r} 不存在")

    for node in nodes:
        seen: set[str] = set()
        current = node
        depth = 1
        while True:
            current_id = current.get("id")
            if not isinstance(current_id, str):
                break
            if current_id in seen:
                failures.append(f"检测到环，涉及节点 {node.get('id')!r}")
                break
            seen.add(current_id)
            if is_root(current):
                break
            parent_id = current.get("parentId")
            if parent_id not in by_id:
                break
            current = by_id[parent_id]
            depth += 1
        if depth > MAX_DEPTH:
            failures.append(f"节点 {node.get('id')!r} 深度为 {depth}，超过上限 {MAX_DEPTH}")

    root_node_id = payload.get("rootNodeId")
    if root_node_id and roots and roots[0].get("id") != root_node_id:
        failures.append("rootNodeId 与实际根节点不一致")

    # ---- provenance（来源诚实）----
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict):
        failures.append("缺少 provenance 对象")
    else:
        gen = provenance.get("generationSource")
        if gen not in VALID_SOURCES:
            failures.append(f"provenance.generationSource 非法: {gen!r}")

    # ---- v2① 需求覆盖成功标准 · 不塌缩 ----
    criteria = payload.get("successCriteria")
    if not isinstance(criteria, list) or not criteria:
        failures.append("缺少 successCriteria（非空列表）——无法验证需求是否覆盖成功标准")
    else:
        crit_ids = [c.get("id") for c in criteria if isinstance(c, dict)]
        if any(cid in (None, "") for cid in crit_ids):
            failures.append("successCriteria 存在空 id")
        need = min(len(crit_ids), 3)
        if len(reqs) < need:
            failures.append(
                f"需求塌缩：{len(crit_ids)} 条成功标准只对应 {len(reqs)} 个需求节点（至少需 {need} 个，别全塞进根节点）"
            )
        covered: set = set()
        for r in reqs:
            cc = r.get("coversCriteria")
            if not isinstance(cc, list) or not cc:
                failures.append(f"需求 {r.get('id')!r} 缺少 coversCriteria（要标明它覆盖哪条成功标准）")
                continue
            for cid in cc:
                covered.add(cid)
                if cid not in crit_ids:
                    failures.append(f"需求 {r.get('id')!r} 引用了不存在的成功标准 {cid!r}")
        for cid in crit_ids:
            if cid not in covered:
                failures.append(f"成功标准 {cid!r} 未被任何需求覆盖")

    # ---- v2② EARS 验收 ----
    for r in reqs:
        if not is_ears(str(r.get("acceptance") or "")):
            failures.append(
                f"需求 {r.get('id')!r} 的验收不是 EARS 句式（需含触发条件 当/若/WHEN/IF 等 + SHALL/应）"
            )

    # ---- v2④ 证据贯穿 ----
    for node in nodes:
        if node.get("type") in ("requirement", "design"):
            refs = node.get("evidenceRefs")
            if not isinstance(refs, list) or not refs:
                failures.append(f"节点 {node.get('id')!r}（{node.get('type')}）缺少 evidenceRefs（至少挂一个证据）")
                continue
            for ev in refs:
                if ev not in evidence_ids:
                    failures.append(f"节点 {node.get('id')!r} 的 evidenceRefs {ev!r} 不指向 evidence 节点")
    for node in nodes:
        if node.get("type") == "evidence" and not str(node.get("source") or "").strip():
            failures.append(f"证据节点 {node.get('id')!r} 的 source 为空（必须写真实出处）")

    deduped: list[str] = []
    seen_messages: set[str] = set()
    for failure in failures:
        if failure not in seen_messages:
            deduped.append(failure)
            seen_messages.add(failure)
    return deduped


def main() -> int:
    try:
        payload = load_payload(sys.argv)
    except Exception as exc:
        print(f"输入错误: {exc}", file=sys.stderr)
        return 2

    failures = validate(payload)
    if failures:
        print("不通过 - 违反的不变量:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"通过 - 合法的规格树（{len(payload['nodes'])} 个节点，{len(payload.get('successCriteria', []))} 条成功标准全覆盖）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
