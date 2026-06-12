import pytest
from code_extractor import extract_code_blocks

def test_extract_single_code_block():
    """测试提取单个代码块"""
    text = """
这是执行方案：

```server.js
const express = require('express');
const app = express();

app.listen(3000);
```

以上是服务端代码。
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 1
    assert blocks[0]["filename"] == "server.js"
    assert "const express = require('express')" in blocks[0]["content"]
    assert blocks[0]["language"] == "js"

def test_extract_multiple_code_blocks():
    """测试提取多个代码块"""
    text = """
后端代码：
```server.js
const express = require('express');
```

前端代码：
```index.html
<!DOCTYPE html>
<html>
</html>
```

样式：
```style.css
body { margin: 0; }
```
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 3
    assert blocks[0]["filename"] == "server.js"
    assert blocks[1]["filename"] == "index.html"
    assert blocks[2]["filename"] == "style.css"

def test_extract_code_block_with_language_only():
    """测试只有语言标识的代码块（无文件名）"""
    text = """
```python
print("Hello, World!")
```
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 1
    assert blocks[0]["filename"] == "main.py"
    assert blocks[0]["language"] == "python"

def test_extract_duplicate_filenames():
    """测试重复文件名的处理"""
    text = """
```server.js
// first server
```

```server.js
// second server
```
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 2
    assert blocks[0]["filename"] == "server.js"
    assert blocks[1]["filename"] == "server_2.js"

def test_extract_empty_code_block():
    """测试空代码块"""
    text = """
```js
```
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 0

def test_extract_no_code_blocks():
    """测试没有代码块的文本"""
    text = "这是一个普通的文本回复，没有代码块。"
    blocks = extract_code_blocks(text)
    assert len(blocks) == 0

def test_extract_mixed_filename_and_language():
    """测试混合文件名和语言标识"""
    text = """
```app.js
const app = {};
```

```javascript
console.log("test");
```

```styles.css
body { color: red; }
```
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 3
    assert blocks[0]["filename"] == "app.js"
    assert blocks[1]["filename"] == "index.js"  # javascript -> index.js
    assert blocks[2]["filename"] == "styles.css"
