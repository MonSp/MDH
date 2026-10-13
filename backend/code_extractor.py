"""
代码提取工具 - 从Agent回复中提取代码块

支持格式：
```filename.js
// code content
```

或

```javascript
// code content (无文件名，使用默认名)
```

历史 bug（2026-10-10 修复）：旧正则 `` ```(.*?)``` `` 对内层围栏敏感——
文档块（README 等）内嵌 ```json 示例时，内层围栏的开栏会提前"闭合"
外层块，导致文档恰好截断在示例之前（R5 E3/E2 README 截断复现）。
本实现按行扫描：文件块用语言围栏深度跟踪，内层示例不再截断外层内容。

未闭合的尾部块（max_tokens 截断）策略：仅文本类扩展名
(.md/.txt/.markdown/.rst) 保留到 EOF（文档截断保留可读残卷），
代码类扩展名仍然丢弃（半截代码入库比缺失更糟）。
"""

import logging
import re

logger = logging.getLogger("code_extractor")

_FENCE_RE = re.compile(r"^```(.*)$")
# 截断时可保留残卷的文本类扩展名
_KEEP_UNTERMINATED_EXTS = {".md", ".markdown", ".txt", ".rst"}


def extract_code_blocks(text: str) -> list[dict[str, str]]:
    """从Agent回复中提取代码块（文件围栏 + 内层语言围栏深度感知）

    Returns:
        [{"filename": "path/to/file.js", "content": "...", "language": "javascript"}, ...]
    """
    lines = text.splitlines(keepends=True)
    n = len(lines)
    blocks: list[dict[str, str]] = []
    i = 0

    def _tag(idx: int) -> str | None:
        m = _FENCE_RE.match(lines[idx].strip())
        return m.group(1).strip() if m else None

    def _is_filename(tag: str) -> bool:
        return ("." in tag or "/" in tag or "\\" in tag) and tag != "tool_call"

    _outer_guard = 0
    _outer_limit = 4 * n + 64
    while i < n:
        _outer_guard += 1
        if _outer_guard > _outer_limit:
            # 防御：任何未推进路径在此熔断（死循环会卡死 asyncio 事件循环）
            logger.warning("extract_code_blocks 外层扫描步数超限，熔断退出")
            break
        tag = _tag(i)
        if tag is None:
            i += 1
            continue

        # tool_call 块由 _extract_tool_calls 处理：跳到下一个裸围栏
        if tag == "tool_call":
            i += 1
            while i < n and _tag(i) != "":
                i += 1
            i += 1  # 跳过闭合裸围栏
            continue

        if _is_filename(tag):
            filename = tag
            language = filename.rsplit(".", 1)[-1] if "." in filename else ""
            j = i + 1
            depth = 0
            end = None
            closed = False
            _scan_guard = 0
            _scan_limit = 4 * n + 64
            while j < n:
                _scan_guard += 1
                if _scan_guard > _scan_limit:
                    logger.warning("extract_code_blocks 文件块扫描步数超限，熔断")
                    break
                t = _tag(j)
                if t is None:
                    j += 1
                    continue
                if _is_filename(t):
                    # 下一个文件块开始：当前块未闭合
                    break
                if t == "":
                    if depth == 0:
                        end = j
                        closed = True
                        break
                    depth -= 1  # 内层示例的闭合围栏（保留在内容中）
                else:
                    depth += 1  # 内层语言围栏开栏（如 ```json）
                j += 1

            if closed:
                content = "".join(lines[i + 1:end])
                next_i = end + 1
            else:
                # EOF 或下一个文件块前未闭合
                if j >= n and ("." + filename.rsplit(".", 1)[-1].lower()) in _KEEP_UNTERMINATED_EXTS:
                    content = "".join(lines[i + 1:])
                    next_i = n
                    closed = True  # 按保留处理，避免死循环
                else:
                    # 代码类未闭合块丢弃（max_tokens 截断的半截代码）
                    i = j if j > i else i + 1
                    continue

            i = next_i
            content = content.strip()
            if not content:
                continue
            blocks.append(_dedupe(blocks, filename, content, language))
            continue

        # 顶层语言块（无文件名）：闭合于深度 0 的裸围栏。
        # 嵌套语言围栏（如语言块内的 ```json 示例）必须推进 j——
        # 否则既不闭合也不前进 → 死循环卡死 asyncio 事件循环（R6 P0）
        language = tag
        filename = _lang_to_filename(language)
        j = i + 1
        depth = 0
        _lang_guard = 0
        _lang_limit = 4 * n + 64
        while j < n:
            _lang_guard += 1
            if _lang_guard > _lang_limit:
                logger.warning("extract_code_blocks 语言块扫描步数超限，熔断")
                break
            t = _tag(j)
            if t is None:
                j += 1
                continue
            if t == "":
                if depth == 0:
                    content = "".join(lines[i + 1:j]).strip()
                    if content:
                        blocks.append(_dedupe(blocks, filename, content, language))
                    i = j + 1
                    break
                depth -= 1  # 内层示例闭合，保留在内容中
            elif _is_filename(t):
                # 未闭合即遇到文件块：丢弃半截语言块
                i = j
                break
            else:
                depth += 1  # 嵌套语言围栏开栏（关键推进点）
            j += 1
        else:
            # EOF 未闭合的语言块：丢弃（与旧行为一致）
            i = n
        continue

    return blocks


def _dedupe(blocks: list[dict], filename: str, content: str, language: str) -> dict:
    """重复文件名加数字后缀（server.js → server_2.js）；只构造不写入，由调用方 append"""
    existing = [b["filename"] for b in blocks]
    if filename in existing:
        name, ext = filename.rsplit(".", 1) if "." in filename else (filename, "")
        counter = 2
        while f"{name}_{counter}.{ext}" in existing:
            counter += 1
        filename = f"{name}_{counter}.{ext}" if ext else f"{name}_{counter}"
    return {"filename": filename, "content": content, "language": language}


def _lang_to_filename(language: str) -> str:
    """根据语言生成默认文件名"""
    lang_map = {
        "javascript": "index.js",
        "js": "index.js",
        "jsx": "App.jsx",
        "typescript": "index.ts",
        "ts": "index.ts",
        "tsx": "App.tsx",
        "python": "main.py",
        "py": "main.py",
        "html": "index.html",
        "css": "styles.css",
        "json": "data.json",
        "bash": "script.sh",
        "sh": "script.sh",
        "yaml": "config.yaml",
        "yml": "config.yaml",
        "markdown": "README.md",
        "md": "README.md",
    }
    return lang_map.get(language.lower(), f"file.{language}" if language else "file.txt")
