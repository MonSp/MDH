# 评测基准 CI 门禁接入指南（benchmark-gate）

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> 本文档承接 `backend/asset_benchmark_gate.py`（评测基准 CI 门禁模块），说明门禁命令的用法、
> 阈值配置、基线记录与 GitHub Actions 接入示例。仓库当前**无 CI 配置**（`.github/workflows` 不存在），
> 本文档提供**接入示例**而非实际接入。配套实施计划见
> `docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci.md`。

## 1. 门禁命令总览

门禁 CLI 入口：`backend/asset_benchmark_gate.py`。评估 LLM judge 的质量指标
（准确率 accuracy / 校准 mae / 区分度 sep）并与阈值对比，输出 `PASS`/`FAIL` 与明细，
退出码 `0`（通过）/`1`（未通过）。

在**仓库根目录**执行（脚本目录自动进入 `sys.path`，兄弟模块 import 可用）：

```bash
python backend/asset_benchmark_gate.py --help
```

### 参数表（与 CLI 逐字对应）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--api-key` | 环境变量 `DEEPSEEK_API_KEY`（缺省空串） | LLM API key；为空 → 无 key 自检模式 |
| `--base-url` | 环境变量 `DEEPSEEK_BASE_URL`，缺省 `https://api.deepseek.com/v1` | OpenAI 兼容 API base URL |
| `--model` | 环境变量 `DEEPSEEK_MODEL`，缺省 `deepseek-chat` | 评测用模型名 |
| `--benchmark-file` | 缺省空（用内置标注集） | 外部标注集 JSON 路径 |
| `--baseline` | 缺省空（不记录） | 基线 JSON 路径（记录指标防退化） |
| `--min-accuracy` | `0.8` | accuracy 下限，低于则 violation |
| `--max-mae` | `0.3` | mae 上限，高于则 violation |
| `--min-sep` | `0.3` | sep（good_mean - bad_mean）下限，低于则 violation |

任何 violation → `passed=False` → 退出码 `1`；全达标 → 退出码 `0`。

## 2. 运行方式

### 2.1 真实 key 门禁（CI / 本地推荐）

提供 `--api-key`（或环境变量 `DEEPSEEK_API_KEY`），用真实 LLM judge 评测：

```bash
python backend/asset_benchmark_gate.py \
  --api-key "$DEEPSEEK_API_KEY" \
  --baseline data/benchmark_baseline.json
```

- 真实模式经 `make_llm_judge(api_key, base_url, model)`（`backend/asset_judge.py:20`）
  构造 LLM judge，逐条评测标注集 → `evaluate_judge` 计算 accuracy/mae/good_mean/bad_mean/sep
  → 对比阈值 → 输出 `PASS（真实 LLM 评测）`/`FAIL`。
- `--benchmark-file` 指定外部标注集（试点部门真实标注集可放 `data/benchmark_items.json`）；
  缺省用内置 `BENCHMARK_ITEMS`。

### 2.2 无 key 自检（本地 / 无密钥 CI）

不提供 key 时，门禁用**确定性 perfect judge**（逐条返回标注 gold_score）验证门禁流程本身：

```bash
python backend/asset_benchmark_gate.py
# [gate] PASS （无 key：门禁流程自检，未运行真实评测）
# [gate] metrics: accuracy=1.000 mae=0.000 sep=0.612 good=0.825 bad=0.212
```

- 自检基于**实际标注集**：传 `--benchmark-file` 时基于传入标注集（T1 修复后语义），
  缺省基于内置 `BENCHMARK_ITEMS`；perfect judge 恒过。
- 自检恒过是特性——只验证命令/流程可运行，**不能**作为质量门禁。

## 3. 阈值配置

默认阈值（`DEFAULT_THRESHOLDS`）：`min_accuracy=0.8`、`max_mae=0.3`、`min_sep=0.3`。

按需覆盖（例如对更高要求的模型评测收紧阈值）：

```bash
python backend/asset_benchmark_gate.py \
  --api-key "$DEEPSEEK_API_KEY" \
  --min-accuracy 0.85 \
  --max-mae 0.2 \
  --min-sep 0.5
```

判定语义（任一命中即 FAIL）：

- `accuracy < min_accuracy` → violation
- `mae > max_mae` → violation
- `sep < min_sep` → violation

## 4. 基线（防退化）

`--baseline <path>` 把本次指标写入基线 JSON（随代码变更提交，供对比防退化）：

```json
{
 "timestamp": "2026-08-15T12:00:00",
 "commit": "7e3013f...",
 "metrics": { "accuracy": 1.0, "mae": 0.0, "good_mean": 0.825, "bad_mean": 0.212, "sep": 0.612 },
 "passed": true
}
```

- 字段：`timestamp`（本地时间 `%Y-%m-%dT%H:%M:%S`）、`commit`（`git rev-parse HEAD`，
  非 git 环境/失败回退空串）、`metrics`（五项指标）、`passed`。
- 建议路径 `data/benchmark_baseline.json`，与代码一并提交；`commit` 字段使基线可溯源——
  配合 `git diff` 可判断指标漂移由哪次提交引入。
- 基线由**合入后**的新一轮真实评测生成/更新，不要用自检结果覆盖。

## 5. GitHub Actions workflow 示例

新建 `.github/workflows/benchmark-gate.yml`：

```yaml
name: benchmark-gate

on:
  push:
    branches: [main]
    paths:
      - 'backend/asset_benchmark_gate.py'
      - 'backend/asset_judge*.py'
      - 'backend/asset_judge_benchmark.py'
      - 'data/benchmark_baseline.json'
  pull_request:
    paths:
      - 'backend/asset_benchmark_gate.py'
      - 'backend/asset_judge*.py'
      - 'backend/asset_judge_benchmark.py'

jobs:
  benchmark-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r backend/requirements.txt

      - name: Run benchmark gate
        run: |
          python backend/asset_benchmark_gate.py \
            --api-key "${{ secrets.DEEPSEEK_API_KEY }}" \
            --baseline data/benchmark_baseline.json
```

**成功/失败语义**

- 退出码 `0`（PASS）→ job 绿，PR 可合并。
- 退出码 `1`（FAIL，指标未达阈值）→ job 红，PR 阻断——须修复 judge/标注集或
  在确认指标合理后更新基线再合入。

**前置条件**

- 配置 `DEEPSEEK_API_KEY`：仓库 Settings → Secrets and variables → Actions →
  New repository secret，命名 `DEEPSEEK_API_KEY`。
- `paths` 过滤把真实评测限定在 judge/门禁相关改动，避免每次 PR 都消耗 token。

**无 key 变体（fork / 无密钥场景，仅自检不阻断）**

```yaml
      - name: Run benchmark gate (self-check)
        run: python backend/asset_benchmark_gate.py
```

- 无 key → 自检恒过（输出注明"未运行真实评测"）；该变体不验证 judge 质量，
  只验证命令与门禁流程本身可运行。

## 6. 已知边界

- **真实评测消耗 token**：每条标注集项发起一次 `chat/completions` 调用
  （`temperature=0.2, max_tokens=16`），token 消耗随标注集规模线性增长。CI 中建议用
  `paths` 触发过滤 + 限制基准规模控制成本。
- **CI 无 key 时自检恒过**：无 key → perfect judge → 恒 PASS。自检只验证门禁流程可运行，
  不构成质量门禁；要真实门禁必须配置 `secrets.DEEPSEEK_API_KEY`。
- **自检基于传入标注集**：`--benchmark-file` + 无 key 时，perfect judge 基于传入标注集
  逐条返回 gold_score（T1 修复后语义）；缺省基于内置 `BENCHMARK_ITEMS`。
- **`make_llm_judge` 实际入口**：`backend/asset_judge.py:20`（标准库 urllib 直调
  OpenAI 兼容 API）；门禁依赖链 `asset_benchmark_gate` → `asset_judge_benchmark` →
  `asset_evaluator`/`asset_store` 全部为纯标准库，**零新增依赖**。
- **基线含 commit 防退化**：`--baseline` 记录 HEAD commit，指标漂移可回溯到具体提交；
  基线更新应来自真实评测（合入后重新生成），勿用自检覆盖。
