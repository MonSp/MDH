"""文档工具 capability seam：Service Definition（DocBuilder）+ resolve 入口。

provider 可换（stdlib 当前实现；未来 e2b/远端 provider 走同一接口），
consumer（M2 的 create_document 工具）只依赖本模块类型。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class DocSpec:
    title: str = ""
    paragraphs: list[str] = field(default_factory=list)
    bullets: list[str] = field(default_factory=list)
    tables: list[list[str]] = field(default_factory=list)


class DocBuilder(ABC):
    @abstractmethod
    def build(self, spec: DocSpec) -> bytes:
        """把 DocSpec 渲染为 .docx 字节流。"""


def get_doc_builder(provider: str = "stdlib") -> DocBuilder:
    """按 provider 名解析 DocBuilder 实现；未知 provider fail-loud。"""
    if provider == "stdlib":
        from doc_tools.builder import StdlibDocxBuilder
        return StdlibDocxBuilder()
    raise ValueError(f"unknown doc builder provider: {provider}")
