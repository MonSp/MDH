"""
RegistryServer — 轻量级 HTTP 注册表服务（技能市场 Stage 3）

为不想使用 Git 的用户提供 HTTP API。

端点：
- GET /skills — 列出所有技能
- GET /skills/{name} — 获取技能详情
- GET /skills/{name}/download — 下载技能包
- POST /skills/upload — 上传技能包
- GET /search?q= — 搜索技能
"""

import io
import json
import logging
import zipfile
from pathlib import Path

import yaml

logger = logging.getLogger("registry_server")


class RegistryServer:
    """轻量级 HTTP 注册表服务。

    用法：
        server = RegistryServer("/path/to/storage")

        # 获取 FastAPI app
        app = server.create_app()
    """

    def __init__(self, storage_dir: str):
        self._storage_dir = Path(storage_dir)
        self._skills_dir = self._storage_dir / "skills"
        self._skills_dir.mkdir(parents=True, exist_ok=True)
        self._index: dict[str, dict] = {}
        self._rebuild_index()

    def _rebuild_index(self) -> None:
        """重建技能索引"""
        self._index = {}
        for skill_dir in self._skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            meta = self._read_meta(skill_dir)
            if meta:
                self._index[meta["name"]] = meta

    def _read_meta(self, skill_dir: Path) -> dict | None:
        """读取技能元数据"""
        # manifest.json
        manifest = skill_dir / "manifest.json"
        if manifest.exists():
            try:
                return json.loads(manifest.read_text(encoding="utf-8"))
            except Exception:
                pass

        # SKILL.md frontmatter
        skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            try:
                import re
                content = skill_md.read_text(encoding="utf-8")
                match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
                if match:
                    return yaml.safe_load(match.group(1)) or {}
            except Exception:
                pass

        # manifest.yaml
        manifest_yaml = skill_dir / "manifest.yaml"
        if manifest_yaml.exists():
            try:
                return yaml.safe_load(manifest_yaml.read_text(encoding="utf-8")) or {}
            except Exception:
                pass

        return None

    def list_skills(self) -> list[dict]:
        """列出所有技能"""
        return list(self._index.values())

    def get_skill(self, skill_name: str) -> dict | None:
        """获取技能详情"""
        return self._index.get(skill_name)

    def download_skill(self, skill_name: str) -> bytes | None:
        """下载技能包为 zip"""
        skill_dir = self._skills_dir / skill_name
        if not skill_dir.exists():
            return None

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in skill_dir.rglob("*"):
                if file_path.is_file() and not file_path.name.startswith("."):
                    arcname = f"{skill_name}/{file_path.relative_to(skill_dir)}"
                    zf.write(str(file_path), arcname)
        return buffer.getvalue()

    def upload_skill(self, zip_data: bytes, metadata: dict) -> bool:
        """上传技能包"""
        skill_name = metadata.get("name", "")
        if not skill_name:
            return False

        skill_dir = self._skills_dir / skill_name
        skill_dir.mkdir(parents=True, exist_ok=True)

        try:
            # 解压 zip
            with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
                zf.extractall(str(skill_dir))

            # 写入 manifest.json
            manifest = skill_dir / "manifest.json"
            manifest.write_text(
                json.dumps(metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            # 更新索引
            self._index[skill_name] = metadata
            logger.info("已上传技能: %s", skill_name)
            return True

        except Exception as e:
            logger.error("上传技能失败: %s", e)
            return False

    def search_skills(self, query: str = "", category: str = "") -> list[dict]:
        """搜索技能"""
        results = []
        query_lower = query.lower()

        for name, meta in self._index.items():
            # 类别过滤
            if category and meta.get("category") != category:
                continue

            # 关键词匹配
            if query_lower:
                match = False
                if query_lower in name.lower():
                    match = True
                if query_lower in meta.get("description", "").lower():
                    match = True
                if any(query_lower in kw.lower() for kw in meta.get("keywords", [])):
                    match = True
                if not match:
                    continue

            results.append(meta)

        return results

    def create_app(self):
        """创建 FastAPI 应用"""
        from fastapi import FastAPI, File, HTTPException, Query, UploadFile
        from fastapi.responses import Response

        app = FastAPI(title="MDH Skill Registry", version="1.0.0")

        @app.get("/skills")
        async def list_skills():
            return {"skills": self.list_skills()}

        @app.get("/skills/{skill_name}")
        async def get_skill(skill_name: str):
            meta = self.get_skill(skill_name)
            if not meta:
                raise HTTPException(status_code=404, detail="Skill not found")
            return meta

        @app.get("/skills/{skill_name}/download")
        async def download_skill(skill_name: str):
            data = self.download_skill(skill_name)
            if not data:
                raise HTTPException(status_code=404, detail="Skill not found")
            return Response(
                content=data,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={skill_name}.zip"},
            )

        @app.post("/skills/upload")
        async def upload_skill(
            file: UploadFile = File(...),
            metadata: str = "{}",
        ):
            try:
                meta = json.loads(metadata)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid metadata JSON")

            zip_data = await file.read()
            success = self.upload_skill(zip_data, meta)
            if not success:
                raise HTTPException(status_code=500, detail="Upload failed")
            return {"success": True, "name": meta.get("name")}

        @app.get("/search")
        async def search_skills(
            q: str = Query("", description="Search query"),
            category: str = Query("", description="Category filter"),
        ):
            return {"skills": self.search_skills(query=q, category=category)}

        @app.get("/health")
        async def health():
            return {"status": "ok", "skills_count": len(self._index)}

        return app
