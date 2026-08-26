import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from provider_registry import PROVIDER_REGISTRY

async def test():
    reg = PROVIDER_REGISTRY['deepseek']
    cred = reg['credential_cls'](api_key=os.environ['DEEPSEEK_API_KEY'], base_url=os.environ['DEEPSEEK_BASE_URL'])
    model = reg['model_cls'](model_name='deepseek-chat', credential=cred, stream=True)
    print(f'Model: {type(model).__name__}')
    from agentscope.message import Msg
    msg = Msg(name='user', role='user', content=[{'type': 'text', 'text': 'Say hello in one word'}])
    response = await model.reply(msg)
    print(f'Response: {response.content}')

asyncio.run(test())
