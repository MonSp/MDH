import os
import sys
from unittest.mock import MagicMock

import pytest

# 加入 backend/ 目录（支持 from xxx import ...）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
# 加入项目根目录（支持 from backend.xxx import ...）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Mock agentscope 子模块（容器内未完整安装）
_agentscope_mock = MagicMock()
for mod in [
    'agentscope', 'agentscope.agent', 'agentscope.message', 'agentscope.model',
    'agentscope.formatter', 'agentscope.credential', 'agentscope.event',
    'agentscope.skill', 'agentscope.tool', 'agentscope.state',
    'agentscope.state._task',
]:
    if mod not in sys.modules:
        sys.modules[mod] = _agentscope_mock


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
