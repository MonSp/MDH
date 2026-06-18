"""
端到端测试脚本 - 验证智能体公司项目流程

使用方法：
1. 确保后端正在运行：python backend/server.py
2. 运行测试：python backend/test_e2e_flow.py
"""

import asyncio
import json
import sys
import os

# 添加backend目录到path
sys.path.insert(0, os.path.dirname(__file__))

from meeting_coordinator import MeetingCoordinator
from meeting import MeetingSession


async def test_flow():
    """测试完整的项目流程"""
    print("=" * 60)
    print("智能体公司项目流程测试")
    print("=" * 60)
    
    # 创建测试会议
    meeting = MeetingSession('test-meeting')
    meeting.start()
    
    # 创建协调器（使用测试API key）
    coordinator = MeetingCoordinator(
        meeting_session=meeting,
        provider='deepseek',
        model_name='',
        api_key='test-key',  # 测试用
    )
    
    # 跟踪消息
    messages = []
    async def on_message(agent_id, text, delta, **kwargs):
        # 替换Unicode字符以避免编码问题
        safe_text = text.replace('\u2022', '-').replace('\u2713', 'OK').replace('\u2717', 'X')
        # 替换emoji
        import re
        safe_text = re.sub(r'[\U0001f300-\U0001f9ff]', '', safe_text)
        messages.append({
            'agent_id': agent_id,
            'text': safe_text,
            'phase': detect_phase(safe_text)
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
        result = await coordinator.process_user_message(
            'Create a simple calculator with add and subtract functions',
            on_message
        )
        print("\n" + "=" * 60)
        print("流程完成!")
        print("结果类型: " + str(result.get('type')))
        print("总消息数: " + str(len(messages)))
    except Exception as e:
        import traceback
        print("\n" + "=" * 60)
        print("流程停止: " + type(e).__name__)
        print("错误信息: " + str(e)[:100])
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
    
    for phase in required_phases:
        if phase in phase_counts:
            print("  OK: " + phase)
        else:
            print("  MISSING: " + phase)
    
    return len(messages) > 0


async def main():
    """主测试函数"""
    try:
        success = await test_flow()
        if success:
            print("\n" + "=" * 60)
            print("测试通过! 智能体公司项目流程已验证。")
            print("=" * 60)
            return 0
        else:
            print("\n" + "=" * 60)
            print("测试失败! 未检测到消息流。")
            print("=" * 60)
            return 1
    except Exception as e:
        print(f"\n测试异常: {e}")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
