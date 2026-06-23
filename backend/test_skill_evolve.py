import requests
import sys

BASE = "http://localhost:8765"
TIMEOUT = 10

# 1. Trigger skill evolution
print("[1] Triggering skill evolution...")
resp = requests.post(f'{BASE}/api/skills/evolve', json={
    'project_id': 'test-project-001',
    'task_description': '创建一个Python Flask Web应用，实现RESTful API',
    'discussion_results': [
        {'role': 'planner', 'content': '建议采用Flask + SQLite架构，先实现核心CRUD', 'parsed_stance': 'support'},
        {'role': 'executor', 'content': '同意轻量方案，先跑通MVP再迭代', 'parsed_stance': 'support'},
        {'role': 'reviewer', 'content': '建议增加输入校验和错误处理中间件', 'parsed_stance': 'modify'},
    ],
    'review_result': {
        'reviewer_feedback': '代码结构清晰，但缺少单元测试和类型注解',
        'monitor_feedback': '建议添加Dockerfile和健康检查端点',
    },
    'execution_results': [
        {'written_files': ['app.py', 'requirements.txt', 'README.md'], 'code_blocks_count': 3},
    ],
}, timeout=TIMEOUT)
data = resp.json()
rules = data.get('data', {}).get('rules', [])
print(f"  Extracted {len(rules)} rules")
for r in rules:
    print(f"    [{r['rule_type']}] {r['action'][:60]}")

# 2. Approve all rules
print("\n[2] Approving rules...")
resp2 = requests.get(f'{BASE}/api/experience/rules/pending', timeout=TIMEOUT)
pending = resp2.json().get('data', [])
for rule in pending:
    rid = rule['rule_id']
    requests.post(f'{BASE}/api/experience/rules/{rid}/approve', json={}, timeout=TIMEOUT)
    print(f"  Approved: {rid[:12]}...")

# 3. Verify approved rules
print("\n[3] Verifying approved rules...")
resp3 = requests.get(f'{BASE}/api/experience/rules', timeout=TIMEOUT)
approved = [r for r in resp3.json().get('data', []) if r.get('status') == 'approved']
print(f"  Total approved: {len(approved)}")

# 4. Test local retrieval
print("\n[4] Testing local rule retrieval...")
sys.path.insert(0, 'backend')
from experience_extractor import ExperienceExtractor
import os
data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, 'experience'))
rules_found = extractor.retrieve_relevant_rules('software-dev', ['python', 'flask', 'api'])
print(f"  Found {len(rules_found)} matching rules for 'software-dev + python/flask/api'")
for r in rules_found:
    print(f"    [{r.rule_type}] {r.action[:60]}")

# 5. Build context
if rules_found:
    ctx = extractor.build_experience_context(rules_found)
    print(f"\n[5] Injected context ({len(ctx)} chars):")
    print(ctx[:300])
    print("\n=== ALL TESTS PASSED ===")
else:
    print("\n=== FAIL: No rules retrieved ===")
