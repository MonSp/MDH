"""LLM judge：资产质量评分（0-1），标准库 urllib 直调 OpenAI 兼容 API。

设计 [S4]：judge seam 可注入；本模块提供真实 LLM judge（试点已验证，
排序/阈值语义——好资产高分、差资产低分）。解析失败抛 ValueError，
fail-closed 由 AssetEvaluator.evaluate 层处理（judge 异常 → 拒绝）。
"""

import json
import os
import re
import urllib.request
from collections.abc import Callable

# 数字 lookaround（而非 \b）：\b 在 re.UNICODE 下把 CJK 字符当 \w，无法分隔
# 数字与中文——"0.85分" 会被 \b 版正则误解析为 "0"（静默 0.0）、"得分0.85"
# 无匹配（ValueError）。lookaround 只按 \d 判界，CJK 相邻分数正确解析。
_SCORE_RE = re.compile(r"(?<!\d)(?:0(?:\.\d+)?|1(?:\.0+)?)(?!\d)")


def make_llm_judge(api_key: str, base_url: str, model: str) -> Callable[[dict], float]:
    """构造 LLM judge：输入资产 dict，返回 0-1 质量分数。"""

    def judge(asset: dict) -> float:
        prompt = (
            "你是资产质量评审专家。请评估以下会议纪要类资产的质量（结构化程度、完整性、"
            "是否包含可执行的待办与责任人）。只输出一个 0 到 1 之间的分数，不要其他内容。\n"
            f"资产类型: {asset.get('type')}\n标题: {asset.get('title')}\n内容:\n{asset.get('content')}\n"
        )
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "你是严谨的文档质量评审员，只输出分数。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 16,
        }
        req = urllib.request.Request(
            f"{base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        m = _SCORE_RE.search(text)
        if not m:
            raise ValueError(f"无法从 judge 响应解析分数: {text!r}")
        return min(1.0, max(0.0, float(m.group())))

    return judge


def make_judge_from_env() -> Callable[[dict], float] | None:
    """从环境变量构造 judge；DEEPSEEK_API_KEY 缺失时返回 None。"""
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    return make_llm_judge(
        api_key,
        os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
    )
