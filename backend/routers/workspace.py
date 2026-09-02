"""
Workspace REST API Router — document parsing, workspace analysis, artifacts, conflicts.
"""

import logging
import os

from fastapi import APIRouter, Request

from routers.common import fail, ok

logger = logging.getLogger("routers.workspace")

router = APIRouter(tags=["workspace"])

_data_dir = None


def init(data_dir: str):
    global _data_dir
    _data_dir = data_dir


# ── Documents ──

@router.post("/api/documents/parse")
async def parse_document(request: Request):
    try:
        body = await request.json()
        file_path = body.get("file_path", "")
        team_id = body.get("team_id", "")
        if file_path:
            real_path = os.path.realpath(file_path)
            allowed_base = os.path.realpath(_data_dir)
            if not real_path.startswith(allowed_base + os.sep) and real_path != allowed_base:
                return fail("路径不允许")
        from document_parser import DocumentParser
        parser = DocumentParser(_data_dir)
        result = parser.parse_file(file_path, team_id=team_id)
        if result:
            return ok({"doc_id": result["doc_id"], "filename": result["filename"],
                        "summary": result["summary"], "keywords": result["keywords"]})
        return fail("文件不存在或格式不支持")
    except Exception as e:
        logger.exception("parse_document 失败")
        return fail(str(e))


@router.get("/api/documents/search")
async def search_documents(q: str = "", team_id: str = ""):
    try:
        from document_parser import DocumentParser
        results = DocumentParser(_data_dir).search_documents(q, team_id=team_id)
        return ok({"documents": results, "total": len(results)})
    except Exception as e:
        logger.exception("search_documents 失败")
        return fail(str(e))


@router.get("/api/documents/context")
async def get_document_context(task: str = "", team_id: str = ""):
    try:
        from document_parser import DocumentParser
        context = DocumentParser(_data_dir).build_context_for_task(task, team_id=team_id)
        return ok({"context": context, "has_content": bool(context)})
    except Exception as e:
        logger.exception("get_document_context 失败")
        return fail(str(e))


@router.get("/api/documents/stats")
async def get_document_stats():
    try:
        from document_parser import DocumentParser
        return ok(DocumentParser(_data_dir).get_stats())
    except Exception as e:
        logger.exception("get_document_stats 失败")
        return fail(str(e))


# ── Workspace ──

@router.get("/api/workspace/analyze")
async def analyze_workspace(path: str = ""):
    try:
        if path:
            real_path = os.path.realpath(path)
            allowed_base = os.path.realpath(_data_dir)
            if not real_path.startswith(allowed_base + os.sep) and real_path != allowed_base:
                return fail("路径不允许")
        from live_document import LiveDocumentManager
        return ok(LiveDocumentManager(_data_dir).analyze_codebase(path))
    except Exception as e:
        logger.exception("analyze_workspace 失败")
        return fail(str(e))


@router.post("/api/workspace/analyze-dataset")
async def analyze_dataset(request: Request):
    try:
        body = await request.json()
        file_path = body.get("file_path", "")
        if file_path:
            real_path = os.path.realpath(file_path)
            allowed_base = os.path.realpath(_data_dir)
            if not real_path.startswith(allowed_base + os.sep) and real_path != allowed_base:
                return fail("路径不允许")
        from live_document import LiveDocumentManager
        return ok(LiveDocumentManager(_data_dir).analyze_dataset(file_path))
    except Exception as e:
        logger.exception("analyze_dataset 失败")
        return fail(str(e))


@router.get("/api/workspace/artifacts")
async def get_artifact_history(file_path: str = "", agent_id: str = "", limit: int = 20):
    try:
        from live_document import LiveDocumentManager
        mgr = LiveDocumentManager(_data_dir)
        return ok({"history": mgr.get_artifact_history(file_path, agent_id, limit), "stats": mgr.get_artifact_stats()})
    except Exception as e:
        logger.exception("get_artifact_history 失败")
        return fail(str(e))


@router.get("/api/workspace/conflicts")
async def get_document_conflicts(limit: int = 10):
    try:
        from live_document import LiveDocumentManager
        return ok({"conflicts": LiveDocumentManager(_data_dir).get_conflicts(limit)})
    except Exception as e:
        logger.exception("get_document_conflicts 失败")
        return fail(str(e))
