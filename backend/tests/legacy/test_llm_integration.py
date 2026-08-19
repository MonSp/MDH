"""
MDH 真实 LLM 集成测试
使用 DeepSeek API 测试完整的多智能体协作流程
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, '/home/test/MDH/backend')
os.chdir('/home/test/MDH/backend')

from meeting import MeetingSession
from meeting_coordinator import MeetingCoordinator


async def test_semantic_analyze(coordinator):
    """测试语义分析"""
    print('=== 测试 1: 语义分析 ===')
    result = await coordinator.semantic_analyze('帮我写一个Python快速排序算法')
    print(f'  is_task: {result.is_task}')
    print(f'  intent: {result.intent}')
    print(f'  target: {result.target_agent_id}')
    print(f'  reason: {result.reason[:80] if result.reason else "N/A"}')
    assert result.is_task is True
    print('  PASSED')
    return result


async def test_discussion(coordinator):
    """测试多智能体讨论"""
    print('\n=== 测试 2: 多智能体讨论 ===')
    messages = []
    async def on_message(agent_id, content, extra='', **kwargs):
        messages.append({'agent': agent_id, 'content': content[:100]})
        print(f'  [{agent_id}] {content[:80]}')

    discussion = await coordinator.run_discussion(
        '如何设计一个高并发的消息队列系统？',
        on_message,
        max_rounds=2,
    )
    print(f'  讨论轮次: {len(discussion)}')
    print(f'  消息数: {len(messages)}')
    assert len(discussion) > 0
    assert len(messages) > 0
    print('  PASSED')


async def test_tool_execution(coordinator):
    """测试工具调用"""
    print('\n=== 测试 3: 工具调用 ===')
    result = await coordinator.execute_tool_call('bash', {'command': 'echo "Hello from MDH test"'})
    print(f'  结果: {str(result)[:100]}')
    assert result is not None
    print('  PASSED')


async def main():
    start = time.time()

    session = MeetingSession('llm-integration-test')
    session.start()

    coordinator = MeetingCoordinator(
        meeting_session=session,
        provider='deepseek',
        model_name=os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat'),
        api_key=os.environ.get('DEEPSEEK_API_KEY'),
        base_url=os.environ.get('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
    )

    print(f'配置: provider=deepseek, model={os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")}')
    print(f'API Key: {os.environ.get("DEEPSEEK_API_KEY", "NOT SET")[:15]}...')
    print()

    try:
        await test_semantic_analyze(coordinator)
        await test_discussion(coordinator)
        await test_tool_execution(coordinator)

        elapsed = time.time() - start
        print(f'\n=== 所有测试通过 ({elapsed:.1f}s) ===')
    except Exception as e:
        print(f'\n=== 测试失败: {e} ===')
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    asyncio.run(main())
