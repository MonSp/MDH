import sys
import os
from unittest.mock import MagicMock

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
