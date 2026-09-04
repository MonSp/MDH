import os
import sys

import pytest

# 加入 backend/ 目录（支持 from xxx import ...）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
# 加入项目根目录（支持 from backend.xxx import ...）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# 清除全局缓存（防止测试间污染）
@pytest.fixture(autouse=True)
def _clear_cache():
    try:
        from cache import get_cache
        get_cache().clear()
    except ImportError:
        pass
    yield
    try:
        from cache import get_cache
        get_cache().clear()
    except ImportError:
        pass
