"""Prometheus 指标定义 — MDH 系统级计数器和仪表

所有 Prometheus 指标在此集中定义，供各模块导入使用。
使用 prometheus_client 库的标准 Counter/Gauge/Histogram。
"""

from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST

# LLM metrics
LLM_CALLS = Counter('mdh_llm_calls_total', 'LLM API calls', ['provider', 'model', 'status'])
LLM_TOKENS = Counter('mdh_llm_tokens_total', 'LLM tokens consumed', ['provider', 'model', 'direction'])
LLM_CACHE_HITS = Counter('mdh_llm_cache_hits_total', 'LLM cache hits')
LLM_CACHE_MISSES = Counter('mdh_llm_cache_misses_total', 'LLM cache misses')

# Task metrics
TASK_SUCCESS = Counter('mdh_task_success_total', 'Successful tasks', ['task_type'])
TASK_FAILURE = Counter('mdh_task_failure_total', 'Failed tasks', ['task_type'])

# Evolution metrics
EVOLUTION_EVENTS = Counter('mdh_evolution_events_total', 'Evolution events', ['event_type'])
XP_GRANTED = Counter('mdh_xp_granted_total', 'XP granted to agents')
SKILL_LEVEL_UPS = Counter('mdh_skill_level_ups_total', 'Skill level ups')

# WebSocket metrics
WS_CONNECTIONS = Gauge('mdh_ws_connections_active', 'Active WebSocket connections')
WS_MESSAGES = Counter('mdh_ws_messages_total', 'WebSocket messages', ['direction'])
