"""
代码提取工具 - 从Agent回复中提取代码块
"""

import re
from typing import List, Dict


def extract_code_blocks(text: str) -> List[Dict[str, str]]:
    """
    从Agent回复中提取代码块
    
    支持格式：
    ```filename.js
    // code content
    ```
    
    或
    
    ```javascript
    // code content (无文件名，使用默认名)
    ```
    
    Returns:
        [{"filename": "path/to/file.js", "content": "...", "language": "javascript"}, ...]
    """
    blocks = []
    # 匹配 ```language\n...\n``` 或 ```path/filename.ext\n...\n```
    pattern = r'```([\w/\\]+(?:\.\w+)?)\s*\n(.*?)```'
    
    for match in re.finditer(pattern, text, re.DOTALL):
        lang_or_file = match.group(1)
        content = match.group(2).strip()
        
        if not content:
            continue
        
        # 跳过 tool_call 块（由 _extract_tool_calls 处理）
        if lang_or_file == 'tool_call':
            continue
        
        # 判断是文件名/路径还是语言标识
        if '.' in lang_or_file or '/' in lang_or_file or '\\' in lang_or_file:
            # 有扩展名或路径分隔符，认为是文件名
            filename = lang_or_file
            language = filename.rsplit('.', 1)[-1] if '.' in filename else ''
        else:
            # 语言标识，生成默认文件名
            language = lang_or_file
            filename = _lang_to_filename(language)
        
        # 如果文件名已存在，添加数字后缀
        existing = [b["filename"] for b in blocks]
        if filename in existing:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            counter = 2
            while f"{name}_{counter}.{ext}" in existing:
                counter += 1
            filename = f"{name}_{counter}.{ext}" if ext else f"{name}_{counter}"
        
        blocks.append({
            "filename": filename,
            "content": content,
            "language": language,
        })
    
    return blocks


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
        "css": "style.css",
        "json": "config.json",
        "sql": "schema.sql",
        "bash": "script.sh",
        "sh": "script.sh",
        "dockerfile": "Dockerfile",
        "yaml": "config.yaml",
        "yml": "config.yaml",
        "md": "README.md",
        "markdown": "README.md",
    }
    return lang_map.get(language.lower(), f"file.{language}")
