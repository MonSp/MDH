"""
端到端测试脚本 - 验证智能体公司项目流程

使用方法：
1. 确保后端正在运行：python backend/server.py
2. 运行测试：
   python backend/test_e2e_flow.py --api-key YOUR_KEY
   python backend/test_e2e_flow.py --api-key YOUR_KEY --base-url https://api.deepseek.com
   python backend/test_e2e_flow.py --api-key YOUR_KEY --provider deepseek --model deepseek-chat
"""

import argparse
import asyncio
import json
import re
import sys
import os

# 添加backend目录到path
sys.path.insert(0, os.path.dirname(__file__))

from meeting_coordinator import MeetingCoordinator
from meeting import MeetingSession


def parse_args():
    parser = argparse.ArgumentParser(description="智能体公司项目流程端到端测试")
    parser.add_argument("--api-key", required=True, help="LLM API Key")
    parser.add_argument("--base-url", default="", help="LLM API Base URL（留空使用提供商默认值）")
    parser.add_argument("--provider", default="deepseek", help="模型提供商 (默认: deepseek)")
    parser.add_argument("--model", default="", help="模型名称 (留空使用提供商默认值)")
    parser.add_argument("--task", default="Create a simple calculator with add and subtract functions", help="测试任务描述")
    return parser.parse_args()


async def test_flow(api_key: str, base_url: str, provider: str, model_name: str, task: str):
    """测试完整的项目流程"""
    print("=" * 60)
    print("智能体公司项目流程测试")
    print("=" * 60)
    print(f"Provider: {provider}")
    print(f"Model:    {model_name or '(默认)'}")
    print(f"Base URL: {base_url or '(默认)'}")
    print(f"Task:     {task[:60]}...")
    print("=" * 60)

    # 创建测试会议
    meeting = MeetingSession('test-meeting')
    meeting.start()

    # 创建协调器
    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider=provider,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
    )

    # 跟踪消息
    messages = []

    async def on_message(agent_id, text, delta, **kwargs):
        safe_text = text.replace('\u2022', '-').replace('\u2713', 'OK').replace('\u2717', 'X')
        safe_text = re.sub(r'[\U0001f300-\U0001f9ff]', '', safe_text)
        messages.append({
            'agent_id': agent_id,
            'text': safe_text,
            'phase': detect_phase(safe_text),
        })
        if len(safe_text) > 80:
            print('[' + agent_id + '] ' + safe_text[:80] + '...')
        else:
            print('[' + agent_id + '] ' + safe_text)

    def detect_phase(text):
        """检测消息所属阶段"""
        if 'CEO' in text and '收到任务' in text:
            return 'CEO_HANDOFF'
        elif '需求确认' in text or '确认细节' in text:
            return 'REQUIREMENTS_CONFIRMATION'
        elif '项目经理分析' in text or '意图' in text:
            return 'ANALYSIS'
        elif '制定项目计划' in text or '阶段1' in text:
            return 'PROJECT_PLANNING'
        elif '组织团队讨论' in text:
            return 'DISCUSSION'
        elif '整合讨论结果' in text:
            return 'INTEGRATION'
        elif '分派任务' in text or '分派给' in text:
            return 'TASK_ASSIGNMENT'
        elif '执行任务' in text or '监督' in text:
            return 'EXECUTION'
        elif '项目总结' in text:
            return 'PROJECT_SUMMARY'
        elif '汇报结果' in text:
            return 'REPORT'
        else:
            return 'OTHER'

    # 测试流程
    print("\n开始测试流程...")
    print("-" * 60)

    try:
        result = await coordinator.process_user_message(task, on_message)
        print("\n" + "=" * 60)
        print("流程完成!")
        print("结果类型: " + str(result.get('type')))
        print("总消息数: " + str(len(messages)))
    except Exception as e:
        import traceback
        print("\n" + "=" * 60)
        print("流程停止: " + type(e).__name__)
        print("错误信息: " + str(e)[:200])
        print("错误前消息数: " + str(len(messages)))
        print("\n详细错误:")
        traceback.print_exc()

    # 分析消息流
    print("\n" + "=" * 60)
    print("消息流分析:")
    print("-" * 60)

    phase_counts = {}
    for msg in messages:
        phase = msg['phase']
        phase_counts[phase] = phase_counts.get(phase, 0) + 1

    for phase, count in phase_counts.items():
        print(f"  {phase}: {count} 条消息")

    # 验证关键阶段
    print("\n" + "=" * 60)
    print("关键阶段验证:")
    print("-" * 60)

    required_phases = [
        'CEO_HANDOFF',
        'REQUIREMENTS_CONFIRMATION',
        'ANALYSIS',
        'PROJECT_PLANNING',
    ]

    all_passed = True
    for phase in required_phases:
        if phase in phase_counts:
            print("  OK: " + phase)
        else:
            print("  MISSING: " + phase)
            all_passed = False

    return len(messages) > 0 and all_passed


def main():
    args = parse_args()
    try:
        success = asyncio.run(test_flow(
            api_key=args.api_key,
            base_url=args.base_url,
            provider=args.provider,
            model_name=args.model,
            task=args.task,
        ))
        if success:
            print("\n" + "=" * 60)
            print("测试通过! 智能体公司项目流程已验证。")
            print("=" * 60)
            return 0
        else:
            print("\n" + "=" * 60)
            print("测试失败! 未检测到完整消息流。")
            print("=" * 60)
            return 1
    except Exception as e:
        print(f"\n测试异常: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
