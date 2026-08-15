import os

import pytest

from asset_store import AssetStore


def test_store_artifact(tmp_path):
    store = AssetStore(str(tmp_path))
    asset = store.store_artifact("team-x", "纪要-0815", "内容", source_task_id="minutes-abc")
    assert asset["type"] == "artifact" and asset["status"] == "approved"
    assert asset["team_id"] == "team-x" and asset["source_task_id"] == "minutes-abc"
    assert os.path.exists(tmp_path / "team-x" / "artifacts" / f"{asset['asset_id']}.json")


def test_propose_approve_template(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "发布计划模板", "标题\n要点\n待办", approver="emp-001")
    assert store.get(asset_id)["status"] == "proposed"
    assert store.approve_template(asset_id, "emp-001")
    assert store.get(asset_id)["status"] == "approved"
    assert store.get(asset_id)["approved_by"] == "emp-001"


def test_reject_template_removes(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "坏模板", "内容")
    assert store.reject_template(asset_id, "质量差")
    assert store.get(asset_id) is None


def test_search_by_type_and_query(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "发布计划 上线日期")
    store.propose_template("team-x", "发布计划模板", "标题\n要点")
    hits = store.search("team-x", query="发布计划")
    assert len(hits) == 2
    artifacts = store.search("team-x", query="发布计划", asset_type="artifact")
    assert len(artifacts) == 1 and artifacts[0]["type"] == "artifact"
    # 团队隔离：其他团队检索不到
    assert store.search("team-y", query="发布计划") == []


def test_list_assets_by_status(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要", "内容")
    store.propose_template("team-x", "模板", "标题\n要点")
    approved = store.list_assets("team-x", status="approved")
    assert len(approved) == 1 and approved[0]["type"] == "artifact"


def test_duplicate_detection_in_search_checks(tmp_path):
    store = AssetStore(str(tmp_path))
    store.store_artifact("team-x", "纪要-0815", "内容")
    store.store_artifact("team-x", "纪要-0815", "内容")  # 同团队同标题——去重标记
    assets = store.search("team-x", query="纪要-0815")
    assert len(assets) == 1  # search 去重：同标题保留最先出现


def test_invalid_team_id_rejected(tmp_path):
    store = AssetStore(str(tmp_path))
    for bad in ("../evil", "a/b", "..", ".", "a\\b"):
        with pytest.raises(ValueError):
            store.store_artifact(bad, "越权标题", "内容")
    # 路径遍历未逃逸：base_dir 外无文件产生，base_dir 内也无非法团队目录
    assert not (tmp_path.parent / "evil").exists()
    assert sorted(os.listdir(tmp_path)) == []


def test_approve_template_non_proposed_returns_false(tmp_path):
    store = AssetStore(str(tmp_path))
    asset_id = store.propose_template("team-x", "模板", "内容")
    assert store.approve_template(asset_id, "emp-001")
    # 已批准 → 状态非 proposed → 拒绝重复审批
    assert not store.approve_template(asset_id, "emp-002")
    # 不存在的资产 → False
    assert not store.approve_template("art-does-not-exist", "emp-001")


def test_get_nonexistent_returns_none(tmp_path):
    store = AssetStore(str(tmp_path))
    assert store.get("does-not-exist") is None
