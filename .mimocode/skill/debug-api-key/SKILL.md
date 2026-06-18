---
name: debug-api-key
description: Debug API key configuration issues in the Browser Agent project
---

# API Key Debugging

When an API endpoint reports "未配置API密钥" or similar authentication errors, follow this debugging chain:

## 1. Check Request Body
The frontend should send `api_key` from localStorage:
```javascript
api_key: localStorage.getItem('deepseek_api_key') || undefined
```
Note: Send `undefined` (not `''`) when empty, so the backend can fall back.

## 2. Check Session Storage
The WebSocket session stores the API key when a message is sent via CEO对话面板:
```python
if msg.get("api_key"):
    session.api_key = msg["api_key"]
```
The session only gets the API key AFTER the first message is sent.

## 3. Check Fallback Chain
The endpoint should check in this order:
1. Request body (`body.get("api_key")`)
2. Session (`session.api_key`)
3. Environment variable (`os.environ.get("DEEPSEEK_API_KEY")`)
4. Config file (`from config import DEEPSEEK_API_KEY`)

## 4. Check base_url
- Empty string `""` breaks the HTTP client
- Send `undefined` instead of `''` from frontend
- Backend should fall back to provider default when `None`/empty
- For deepseek: `https://api.deepseek.com`

## 5. Common Issues
- **Session not found**: WebSocket not connected yet
- **API key empty**: User hasn't sent a CEO对话 message yet
- **base_url missing protocol**: Add `https://` prefix
- **base_url is None**: DeepSeek credential requires string, not None
