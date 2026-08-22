"""文档感知协作 — 让数字员工读取/分析上传的文档

核心能力：
1. 文档解析：支持 txt/md/json/yaml/py/js/ts 等文本格式
2. 上下文注入：文档内容自动注入到 agent 上下文
3. 知识提取：从文档中提取关键信息存为资产/规则
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("document_parser")

# 支持的文件类型
SUPPORTED_EXTENSIONS = {
    '.txt', '.md', '.json', '.yaml', '.yml',
    '.py', '.js', '.ts', '.tsx', '.jsx',
    '.html', '.css', '.sql', '.sh',
    '.csv', '.log', '.cfg', '.ini', '.toml',
}

# 每个文件最大解析字节数
MAX_FILE_SIZE = 50_000  # 50KB


class DocumentParser:
    """文档解析器"""

    def __init__(self, data_dir: str):
        self._data_dir = data_dir
        self._docs_dir = os.path.join(data_dir, "documents")
        self._index_path = os.path.join(data_dir, "document_index.json")
        os.makedirs(self._docs_dir, exist_ok=True)
        self._index = self._load_index()

    def _load_index(self) -> List[Dict]:
        try:
            if os.path.isfile(self._index_path):
                with open(self._index_path, encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return []

    def _save_index(self):
        try:
            tmp = self._index_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._index, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._index_path)
        except Exception:
            pass

    def parse_file(self, file_path: str, team_id: str = "") -> Optional[Dict]:
        """解析单个文件

        Returns:
            {"doc_id": str, "filename": str, "content": str, "summary": str,
             "keywords": list, "file_type": str, "size": int}
        """
        if not os.path.isfile(file_path):
            return None

        ext = os.path.splitext(file_path)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            logger.warning("不支持的文件类型: %s", ext)
            return None

        size = os.path.getsize(file_path)
        if size > MAX_FILE_SIZE:
            logger.warning("文件过大: %d bytes (max %d)", size, MAX_FILE_SIZE)
            return None

        try:
            with open(file_path, encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            logger.error("读取文件失败: %s", e)
            return None

        filename = os.path.basename(file_path)
        doc_id = str(uuid.uuid4())[:8]
        summary = self._extract_summary(content, filename)
        keywords = self._extract_keywords(content, filename)

        doc = {
            "doc_id": doc_id,
            "filename": filename,
            "content": content,
            "summary": summary,
            "keywords": keywords,
            "file_type": ext.lstrip("."),
            "size": size,
            "team_id": team_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # 保存到索引
        self._index.append({
            "doc_id": doc_id,
            "filename": filename,
            "file_type": ext.lstrip("."),
            "size": size,
            "summary": summary[:200],
            "keywords": keywords[:10],
            "team_id": team_id,
            "created_at": doc["created_at"],
        })
        self._save_index()

        # 保存文档内容
        doc_path = os.path.join(self._docs_dir, f"{doc_id}.json")
        with open(doc_path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)

        logger.info("文档解析完成: %s (%s, %d bytes)", filename, doc_id, size)
        return doc

    def get_document(self, doc_id: str) -> Optional[Dict]:
        """获取文档内容"""
        doc_path = os.path.join(self._docs_dir, f"{doc_id}.json")
        if not os.path.isfile(doc_path):
            return None
        try:
            with open(doc_path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def search_documents(self, query: str, team_id: str = "") -> List[Dict]:
        """搜索文档（关键词匹配）"""
        query_lower = query.lower()
        results = []
        for entry in self._index:
            if team_id and entry.get("team_id") != team_id:
                continue
            # 匹配文件名、摘要、关键词
            score = 0
            if query_lower in entry.get("filename", "").lower():
                score += 3
            if query_lower in entry.get("summary", "").lower():
                score += 2
            for kw in entry.get("keywords", []):
                if query_lower in kw.lower():
                    score += 1
            if score > 0:
                results.append((score, entry))
        results.sort(key=lambda x: -x[0])
        return [entry for _, entry in results]

    def build_context_for_task(self, task_description: str, team_id: str = "", max_chars: int = 5000) -> str:
        """为任务构建文档上下文

        搜索与任务相关的文档，提取关键内容注入 agent 上下文。
        """
        # 从任务描述中提取关键词
        words = task_description.split()
        keywords = [w for w in words if len(w) > 2][:10]

        matched_docs = []
        for kw in keywords:
            matched = self.search_documents(kw, team_id)
            for entry in matched:
                if entry["doc_id"] not in {d["doc_id"] for d in matched_docs}:
                    matched_docs.append(entry)

        if not matched_docs:
            return ""

        # 构建上下文
        parts = ["## 参考文档"]
        total_chars = 0
        for entry in matched_docs[:3]:  # 最多 3 个文档
            doc = self.get_document(entry["doc_id"])
            if not doc:
                continue
            content = doc.get("content", "")
            if total_chars + len(content) > max_chars:
                content = content[:max_chars - total_chars] + "..."
            parts.append(f"\n### {doc['filename']}\n{content}")
            total_chars += len(content)
            if total_chars >= max_chars:
                break

        return "\n".join(parts) if len(parts) > 1 else ""

    def get_stats(self) -> Dict:
        """文档统计"""
        by_type = {}
        for entry in self._index:
            ft = entry.get("file_type", "unknown")
            by_type[ft] = by_type.get(ft, 0) + 1
        return {
            "total_documents": len(self._index),
            "by_type": by_type,
        }

    @staticmethod
    def _extract_summary(content: str, filename: str) -> str:
        """提取文档摘要（前 200 字符）"""
        # 对于 markdown，提取第一个段落
        if filename.endswith(".md"):
            lines = content.split("\n")
            for line in lines:
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("```"):
                    return line[:200]
        return content[:200].replace("\n", " ").strip()

    @staticmethod
    def _extract_keywords(content: str, filename: str) -> List[str]:
        """提取关键词"""
        import re
        # 提取中英文关键词
        words = re.findall(r'[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}', content)
        # 去重并计数
        from collections import Counter
        counts = Counter(w.lower() for w in words if len(w) > 2)
        # 排除常见停用词
        stop_words = {'the', 'and', 'for', 'this', 'that', 'with', 'from', 'are', 'was', 'were', 'been',
                      'have', 'has', 'had', 'not', 'but', 'can', 'will', 'just', 'into', 'than', 'then'}
        keywords = [w for w, c in counts.most_common(20) if w not in stop_words]
        return keywords[:10]
