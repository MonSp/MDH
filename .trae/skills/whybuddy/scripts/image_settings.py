#!/usr/bin/env python3
"""生图配置的唯一入口 / single source of truth for image generation.

Key、地址(URL)、模型名 这三样只在这里定义一次：
  - 运行时优先读 `image_config.json`（你平时改这个文件就够了）；
  - 万一配置被清空/重置成 dry_run 空壳，就回落到本文件里的 DEFAULT_*。

所有生图脚本（batch_images / finalize_previews / gen_preview）都通过
`resolve()` 拿配置，不再各自硬编码端点和模型，改一处即可全改。

取值优先级（与 image_config.json 的「_key_说明」一致）：
  key   : 环境变量 IMAGE_API_KEY  >  --key  >  配置 api_key   >  DEFAULT_KEY
  model : --model               >  配置 model（忽略空/“not-configured”）  >  DEFAULT_MODEL
  url   : 配置 http.url          >  DEFAULT_URL
"""
from __future__ import annotations

import json
import os
import pathlib
from dataclasses import dataclass, field
from typing import Any

# ====== 唯一需要改的地方：Key / 地址 / 模型 的内置默认 ======
# 注意：默认 key 留空，请用环境变量 IMAGE_API_KEY 提供（不要把 key 写死提交）。
# 这里是「配置被清空时的兜底」，必须和 image_config.json 指向同一家服务商，
# 否则配置没读到时会静默打到错的端点、用对的 key 也 401。
DEFAULT_URL = "https://api.wula.mom/v1/chat/completions"
DEFAULT_MODEL = "gpt-image-2"
DEFAULT_KEY = ""  # 分享版不写死 key：用环境变量 IMAGE_API_KEY
# ==========================================================

DEFAULT_TIMEOUT = 600
DEFAULT_RESP: dict[str, str] = {"path": "data.0.b64_json", "encoding": "b64", "ext": "png"}
DEFAULT_BODY: dict[str, Any] = {
    "response_format": "b64_json",
    "image_size": "2K",
    "aspect_ratio": "16:9",
    "n": 1,
}
LABEL = "预览·未验证 / preview-unverified"
DEFAULT_CONFIG_PATH = "image_config.json"

# 配置里这些 model 取值视为“没配”，回落到 DEFAULT_MODEL
_EMPTY_MODELS = {"", "not-configured", None}


def load_config(path: str | os.PathLike[str] = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    """读 image_config.json；不存在或解析失败都返回 {}（绝不让它压成 dry_run）。"""
    cp = pathlib.Path(path)
    if not cp.exists():
        return {}
    try:
        data = json.loads(cp.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@dataclass
class ImageSettings:
    url: str
    model: str
    key: str
    timeout: int
    body: dict[str, Any] = field(default_factory=dict)
    response: dict[str, str] = field(default_factory=dict)
    label: str = LABEL

    def headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "Authorization": f"Bearer {self.key}"}


def resolve(
    cfg: dict[str, Any] | None = None,
    *,
    cli_model: str = "",
    cli_key: str = "",
    cli_size: str = "",
    cli_timeout: int = 0,
) -> ImageSettings:
    """把「内置默认 + 配置 + 环境变量 + 命令行」按统一优先级合成一份配置。"""
    cfg = cfg or {}
    http = cfg.get("http", {}) if isinstance(cfg, dict) else {}

    url = http.get("url") or DEFAULT_URL

    cfg_model = cfg.get("model")
    if cfg_model in _EMPTY_MODELS:
        cfg_model = ""
    model = cli_model or cfg_model or DEFAULT_MODEL

    key = (
        os.environ.get("IMAGE_API_KEY")
        or cli_key
        or (cfg.get("api_key") if isinstance(cfg, dict) else "")
        or DEFAULT_KEY
    )

    timeout = cli_timeout or int(cfg.get("timeout") or DEFAULT_TIMEOUT)

    # body：用配置的 body_template（去掉 model/prompt，这两个每次注入），否则用默认
    body = {
        k: v
        for k, v in (http.get("body_template", {}) or {}).items()
        if k not in ("model", "prompt")
    } or dict(DEFAULT_BODY)
    if cli_size:
        body["image_size"] = cli_size

    response = http.get("response") or dict(DEFAULT_RESP)
    label = cfg.get("label") or LABEL

    return ImageSettings(
        url=url,
        model=model,
        key=key,
        timeout=timeout,
        body=body,
        response=response,
        label=label,
    )
