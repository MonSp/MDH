"""纯标准库 .docx 生成器：zipfile + 手写 OOXML，零第三方依赖。

M1 最小实现：标题/段落/bullet(• 前缀)/表格；真实 Word 可打开。
"""
import zipfile
from io import BytesIO
from xml.sax.saxutils import escape

from doc_tools.seam import DocBuilder, DocSpec

_CONTENT_TYPES = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    b'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    b'<Default Extension="xml" ContentType="application/xml"/>'
    b'<Override PartName="/word/document.xml" '
    b'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    b'</Types>'
)
_RELS = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    b'<Relationship Id="rId1" '
    b'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    b'Target="word/document.xml"/>'
    b'</Relationships>'
)


class StdlibDocxBuilder(DocBuilder):
    def build(self, spec: DocSpec) -> bytes:
        parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
        parts.append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>')
        if spec.title:
            parts.append(
                f'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
                f'<w:r><w:t>{escape(spec.title)}</w:t></w:r></w:p>'
            )
        for para in spec.paragraphs:
            parts.append(f'<w:p><w:r><w:t>{escape(para)}</w:t></w:r></w:p>')
        for bullet in spec.bullets:
            parts.append(f'<w:p><w:r><w:t>{escape("• " + bullet)}</w:t></w:r></w:p>')
        if spec.tables:
            rows = []
            for row in spec.tables:
                cells = "".join(
                    f'<w:tc><w:p><w:r><w:t>{escape(cell)}</w:t></w:r></w:p></w:tc>'
                    for cell in row
                )
                rows.append(f"<w:tr>{cells}</w:tr>")
            parts.append(f'<w:tbl>{"".join(rows)}</w:tbl>')
        parts.append("</w:body></w:document>")

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", _CONTENT_TYPES)
            zf.writestr("_rels/.rels", _RELS)
            zf.writestr("word/document.xml", "".join(parts).encode("utf-8"))
        return buf.getvalue()
