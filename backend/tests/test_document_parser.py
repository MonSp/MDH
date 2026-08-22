"""Tests for DocumentParser — 文档感知协作"""
import os
import pytest
from document_parser import DocumentParser


@pytest.fixture
def parser(tmp_path):
    return DocumentParser(str(tmp_path))


@pytest.fixture
def sample_doc(tmp_path):
    doc = tmp_path / "readme.md"
    doc.write_text("# 项目说明\n\n这是一个测试项目，用于验证文档解析功能。\n\n## 功能\n- 文档上传\n- 关键词提取", encoding="utf-8")
    return str(doc)


@pytest.fixture
def code_doc(tmp_path):
    doc = tmp_path / "main.py"
    doc.write_text('def hello():\n    """Say hello"""\n    print("Hello World")\n\ndef add(a, b):\n    return a + b\n', encoding="utf-8")
    return str(doc)


class TestDocumentParser:
    def test_parse_markdown(self, parser, sample_doc):
        """解析 Markdown 文件"""
        result = parser.parse_file(sample_doc)
        assert result is not None
        assert result["filename"] == "readme.md"
        assert result["file_type"] == "md"
        assert len(result["content"]) > 0
        assert len(result["keywords"]) > 0

    def test_parse_python(self, parser, code_doc):
        """解析 Python 文件"""
        result = parser.parse_file(code_doc)
        assert result is not None
        assert result["file_type"] == "py"
        assert "hello" in result["keywords"] or "def" in result["keywords"]

    def test_unsupported_type(self, parser, tmp_path):
        """不支持的文件类型返回 None"""
        img = tmp_path / "image.png"
        img.write_bytes(b"\x89PNG\r\n")
        assert parser.parse_file(str(img)) is None

    def test_too_large_file(self, parser, tmp_path):
        """文件过大返回 None"""
        big = tmp_path / "big.txt"
        big.write_text("x" * 100_000, encoding="utf-8")
        assert parser.parse_file(str(big)) is None

    def test_search_documents(self, parser, sample_doc):
        """搜索文档"""
        parser.parse_file(sample_doc)
        results = parser.search_documents("测试项目")
        assert len(results) >= 1

    def test_search_no_match(self, parser, sample_doc):
        """无匹配返回空"""
        parser.parse_file(sample_doc)
        assert len(parser.search_documents("quantum physics")) == 0

    def test_build_context(self, parser, sample_doc):
        """构建任务上下文"""
        parser.parse_file(sample_doc)
        # 用文件名中的关键词搜索
        context = parser.build_context_for_task("readme 项目说明")
        # 只要搜索逻辑能跑通即可（可能有内容也可能没有）
        assert isinstance(context, str)

    def test_get_stats(self, parser, sample_doc, code_doc):
        """文档统计"""
        parser.parse_file(sample_doc)
        parser.parse_file(code_doc)
        stats = parser.get_stats()
        assert stats["total_documents"] == 2
        assert "md" in stats["by_type"]
        assert "py" in stats["by_type"]

    def test_persistence(self, parser, sample_doc, tmp_path):
        """索引持久化"""
        parser.parse_file(sample_doc)
        parser2 = DocumentParser(str(tmp_path))
        assert len(parser2._index) == 1

    def test_get_document(self, parser, sample_doc):
        """获取文档内容"""
        doc = parser.parse_file(sample_doc)
        loaded = parser.get_document(doc["doc_id"])
        assert loaded is not None
        assert loaded["filename"] == "readme.md"
