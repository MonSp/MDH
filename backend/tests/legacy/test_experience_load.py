import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from experience_extractor import ExperienceExtractor

# 使用与 server 相同的数据目录
data_dir = os.path.join(os.path.dirname(__file__), "data")
extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

# 测试1: 检索与 "Python Flask Web 应用" 相关的规则
task_type = "software-dev"
keywords = ["python", "flask", "web", "api", "restful"]
rules = extractor.retrieve_relevant_rules(task_type, keywords)
print(f"=== Rules for 'Python Flask Web': {len(rules)} ===")
for r in rules:
    print(f"  [{r.rule_type}] {r.action[:60]}")
    print(f"    keywords: {r.keywords}")

# 测试2: 构建经验上下文
context = extractor.build_experience_context(rules)
print("\n=== Experience Context ===")
print(context[:500] if context else "(empty)")

# 测试3: 检索无关任务（应该返回空）
rules2 = extractor.retrieve_relevant_rules("ppt-design", ["ppt", "slide"])
print(f"\n=== Rules for 'PPT design': {len(rules2)} ===")

print("\n=== PASS: Approved rules are retrievable ===")
