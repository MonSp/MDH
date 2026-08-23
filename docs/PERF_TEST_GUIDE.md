# MDH 性能测试环境配置与复现指南

## 测试环境

| 项目 | 值 |
|------|-----|
| OS | Linux (Ubuntu) |
| Python | 3.13 |
| SQLite | 内置 (WAL 模式) |
| 数据目录 | `backend/data/` |
| 路由表 | `backend/data/routing_table.json` (8 部门) |
| 数据库 | `backend/data/mdh.db` (WAL, 7 表) |
| 缓存 | `backend/data/llm_cache.db` (SQLite 持久化) |

## 复现步骤

```bash
# 1. 进入后端目录
cd backend/

# 2. 安装依赖
pip install -r requirements.txt

# 3. 确保数据目录存在
ls data/routing_table.json data/mdh.db

# 4. 运行 E2E 功能验证（启动后端 + 31 项功能测试）
python e2e_verify.py

# 5. 运行性能基准（启动后端 + 真实 API/缓存/DB 测量）
python perf_real.py

# 6. 运行单元测试
python -m pytest tests/ --timeout=60 -q --ignore=tests/legacy

# 7. 运行评测基准（任务级）
python benchmark_cli.py --analyze --trends ../baselines/v2.0.0.json ../baselines/v2.1.0.json

# 8. 运行 CI 门禁
python benchmark_gate.py
```

## 性能数据（2026-08-24 实测）

### API 延迟（50 次/端点，含网络）

| 端点 | avg | p50 | p95 | p99 | ops/s |
|------|-----|-----|-----|-----|-------|
| GET /health | 1.3ms | 1.1ms | 1.6ms | 5.0ms | 780 |
| GET /api/benchmark/tasks | 0.9ms | 0.9ms | 1.2ms | 1.9ms | 1,057 |
| GET /api/dashboard/performance | 1.2ms | 1.1ms | 1.7ms | 4.1ms | 833 |

### 路由引擎（直接调用，无网络）

| 测试 | avg | per-message | ops/s | 准确率 |
|------|-----|-------------|-------|--------|
| 8 条消息路由 | 0.363ms | 0.045ms | 2,757 | 5/5 (100%) |

### LLM 缓存（SQLite 持久化）

| 操作 | avg | p95 | ops/s |
|------|-----|-----|-------|
| PUT | 2.242ms | 2.691ms | 446 |
| GET | 1.925ms | 2.474ms | 520 |
| 命中率 | — | — | 100% |
| 语义规范化命中 | — | — | 100% |
| TTL 分层 | creative=120s | review=300s | deterministic=600s |

### SQLite 数据库

| 操作 | avg | p95 | ops/s |
|------|-----|-----|-------|
| evolution_log 读取 | 0.019ms | 0.042ms | 53,279 |
| 快照写入 | 0.073ms | 0.039ms | 13,655 |
| 快照读取 | 0.003ms | 0.004ms | 297,720 |
| 幂等检查 | 0.002ms | 0.002ms | 491,422 |

### Artifact 存储

| 操作 | avg | p95 | ops/s |
|------|-----|-----|-------|
| 写入 | 0.049ms | 0.105ms | 20,494 |
| 读取 | 0.006ms | 0.006ms | 158,396 |

### 并发安全

| 测试 | 结果 | 延迟 |
|------|------|------|
| 并发缓存 (4线程×20次) | ✅ PASS | 184ms |
| 并发 SQLite (4线程×10次) | ✅ PASS | 5ms |
