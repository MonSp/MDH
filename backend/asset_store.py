"""资产存储：知识库（产出物）+ 模板库，团队级目录 + JSON 索引。

设计 [S3]：data/assets/<team_id>/{index.json, artifacts/, templates/}。
资产即文件 + 索引（与 skill_packs/experience_extractor 增量区同构，零新依赖）。
"""

import json
import os
import re
import time
from hashlib import sha1


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _new_asset_id(kind: str) -> str:
    return f"{kind}-{int(time.time() * 1000)}-{sha1(os.urandom(8)).hexdigest()[:8]}"


def _norm_title(title: str) -> str:
    return re.sub(r"\s+", "", title).lower()


class AssetStore:
    def __init__(self, base_dir: str):
        self._base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    # ── 路径与索引 ─────────────────────────────
    def _team_dir(self, team_id: str) -> str:
        d = os.path.join(self._base_dir, team_id)
        os.makedirs(os.path.join(d, "artifacts"), exist_ok=True)
        os.makedirs(os.path.join(d, "templates"), exist_ok=True)
        return d

    def _index_path(self, team_id: str) -> str:
        return os.path.join(self._team_dir(team_id), "index.json")

    def _load_index(self, team_id: str) -> list[dict]:
        try:
            with open(self._index_path(team_id), encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError):
            return []  # 索引缺失/损坏 → 重建

    def _save_index(self, team_id: str, entries: list[dict]) -> None:
        tmp = self._index_path(team_id) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self._index_path(team_id))  # 原子写

    def _asset_path(self, team_id: str, asset_type: str, asset_id: str) -> str:
        return os.path.join(self._team_dir(team_id), f"{asset_type}s", f"{asset_id}.json")

    # ── 资产操作 ───────────────────────────────
    def _write_asset(self, team_id: str, asset: dict) -> dict:
        path = self._asset_path(team_id, asset["type"], asset["asset_id"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(asset, f, ensure_ascii=False, indent=1)
        entries = self._load_index(team_id)
        entries = [e for e in entries if e.get("asset_id") != asset["asset_id"]]
        entries.append({"asset_id": asset["asset_id"], "type": asset["type"], "title": asset["title"], "status": asset["status"]})
        self._save_index(team_id, entries)
        return asset

    def store_artifact(self, team_id: str, title: str, content: str, source_task_id: str = "") -> dict:
        asset = {
            "asset_id": _new_asset_id("art"),
            "type": "artifact",
            "title": title,
            "content": content,
            "source_task_id": source_task_id,
            "team_id": team_id,
            "status": "approved",
            "approved_by": "",
            "created_at": _now_iso(),
            "checks": {},
            "judge_score": None,
        }
        return self._write_asset(team_id, asset)

    def propose_template(self, team_id: str, title: str, content: str, source_task_id: str = "", approver: str = "") -> str:
        asset = {
            "asset_id": _new_asset_id("tpl"),
            "type": "template",
            "title": title,
            "content": content,
            "source_task_id": source_task_id,
            "team_id": team_id,
            "status": "proposed",
            "approved_by": "",
            "created_at": _now_iso(),
            "checks": {},
            "judge_score": None,
        }
        self._write_asset(team_id, asset)
        return asset["asset_id"]

    def approve_template(self, asset_id: str, approver: str) -> bool:
        asset = self.get(asset_id)
        if asset is None or asset["type"] != "template" or asset["status"] != "proposed":
            return False
        asset["status"] = "approved"
        asset["approved_by"] = approver
        self._write_asset(asset["team_id"], asset)
        return True

    def reject_template(self, asset_id: str, reason: str) -> bool:
        asset = self.get(asset_id)
        if asset is None:
            return False
        try:
            os.remove(self._asset_path(asset["team_id"], asset["type"], asset_id))
        except OSError:
            pass
        entries = [e for e in self._load_index(asset["team_id"]) if e.get("asset_id") != asset_id]
        self._save_index(asset["team_id"], entries)
        return True

    def get(self, asset_id: str) -> dict | None:
        # 先查索引定位团队，再读文件
        for team_id in os.listdir(self._base_dir):
            team_dir = os.path.join(self._base_dir, team_id)
            if not os.path.isdir(team_dir):
                continue
            for entry in self._load_index(team_id):
                if entry.get("asset_id") == asset_id:
                    try:
                        with open(self._asset_path(team_id, entry["type"], asset_id), encoding="utf-8") as f:
                            return json.load(f)
                    except (OSError, json.JSONDecodeError):
                        return None
        return None

    def search(self, team_id: str, query: str = "", asset_type: str = "") -> list[dict]:
        team_dir = os.path.join(self._base_dir, team_id)
        if not os.path.isdir(team_dir):
            return []
        q = _norm_title(query) if query else ""
        out = []
        seen: dict[str, int] = {}
        for entry in self._load_index(team_id):
            if asset_type and entry.get("type") != asset_type:
                continue
            asset = self.get(entry["asset_id"])
            if asset is None:
                continue
            if q and q not in _norm_title(asset.get("title", "")) and q not in _norm_title(asset.get("content", "")):
                continue
            key = (asset.get("type"), _norm_title(asset.get("title", "")))
            if key in seen:
                continue  # 同类型同标题去重（保留先出现的）
            seen[key] = 1
            out.append(asset)
        return out

    def list_assets(self, team_id: str, status: str | None = None) -> list[dict]:
        team_dir = os.path.join(self._base_dir, team_id)
        if not os.path.isdir(team_dir):
            return []
        out = []
        for entry in self._load_index(team_id):
            if status and entry.get("status") != status:
                continue
            asset = self.get(entry["asset_id"])
            if asset is not None:
                out.append(asset)
        return out
