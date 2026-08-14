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


def test_create_document_text_unchanged(tmp_path):
    ex = _executor(tmp_path)
    result = ex.execute(ToolCall(
        tool_name="create_document",
        arguments={"path": "note.txt", "content": "纯文本"},
    ))
    assert result.success, result.error
    assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "纯文本"
