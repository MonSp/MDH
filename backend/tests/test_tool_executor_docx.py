"""create_document 工具：format=docx 走 doc_tools 生成真 .docx"""
import zipfile

from tool_executor import ToolExecutor
from tool_registry import ToolCall, ToolRegistry


def _executor(tmp_path):
    return ToolExecutor(ToolRegistry(), str(tmp_path))


def test_create_document_docx_is_valid_zip(tmp_path):
    ex = _executor(tmp_path)
    result = ex.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "minutes.docx", "content": "会议纪要\n行动项A", "format": "docx"},
    ))
    assert result.success, result.error
    f = tmp_path / "minutes.docx"
    assert f.exists()
    with zipfile.ZipFile(f) as zf:
        assert "word/document.xml" in zf.namelist()
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "会议纪要" in xml and "行动项A" in xml
        # 首行作 title：钉住 Heading1 契约
        assert '<w:pStyle w:val="Heading1"/>' in xml


def test_create_document_docx_format_case_insensitive(tmp_path):
    """format 大小写归一化：DOCX 不应静默降级为文本"""
    ex = _executor(tmp_path)
    result = ex.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "upper.DOCX", "content": "标题\n正文", "format": "DOCX"},
    ))
    assert result.success, result.error
    f = tmp_path / "upper.DOCX"
    assert f.exists()
    with zipfile.ZipFile(f) as zf:
        assert "word/document.xml" in zf.namelist()


def test_create_document_unknown_format_falls_back_to_text(tmp_path):
    """未知 format 值按 text 处理（fail-safe）"""
    ex = _executor(tmp_path)
    result = ex.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "note.pdf", "content": "纯文本", "format": "pdf"},
    ))
    assert result.success, result.error
    assert (tmp_path / "note.pdf").read_text(encoding="utf-8") == "纯文本"


def test_create_document_text_unchanged(tmp_path):
    ex = _executor(tmp_path)
    result = ex.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "note.txt", "content": "纯文本"},
    ))
    assert result.success, result.error
    assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "纯文本"
