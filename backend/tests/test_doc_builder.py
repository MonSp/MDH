"""文档工具 seam：DocSpec/DocBuilder + 纯标准库 docx 生成"""
import zipfile
from io import BytesIO

import pytest
from doc_tools.builder import StdlibDocxBuilder
from doc_tools.seam import DocBuilder, DocSpec, get_doc_builder


def test_get_doc_builder_stdlib():
    builder = get_doc_builder("stdlib")
    assert isinstance(builder, DocBuilder)
    assert isinstance(builder, StdlibDocxBuilder)


def test_get_doc_builder_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_doc_builder("nonexistent")


def test_build_returns_valid_docx_zip():
    spec = DocSpec(title="会议纪要", paragraphs=["段落一"], bullets=["行动项A"])
    data = get_doc_builder("stdlib").build(spec)
    assert isinstance(data, bytes)
    with zipfile.ZipFile(BytesIO(data)) as zf:
        names = zf.namelist()
        assert "word/document.xml" in names
        assert "[Content_Types].xml" in names
        assert "_rels/.rels" in names
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "会议纪要" in xml
        assert "段落一" in xml
        assert "行动项A" in xml


def test_build_table_and_escaping():
    spec = DocSpec(
        title="T",
        paragraphs=["<未转义&测试>"],
        tables=[["列A", "列B"], ["1", "2"]],
    )
    xml = _document_xml(get_doc_builder("stdlib").build(spec))
    assert "&lt;未转义&amp;测试&gt;" in xml
    assert "<w:tbl>" in xml
    assert xml.count("<w:tr>") == 2


def _document_xml(data: bytes) -> str:
    with zipfile.ZipFile(BytesIO(data)) as zf:
        return zf.read("word/document.xml").decode("utf-8")
