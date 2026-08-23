.PHONY: dev dev-backend dev-frontend test test-backend test-frontend lint clean help

help: ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── 开发环境 ──

dev: ## 一键启动前端+后端
	@echo "启动后端 (端口 8765)..."
	cd backend && python server.py &
	@sleep 3
	@echo "启动前端 (端口 5173)..."
	npm run dev

dev-backend: ## 仅启动后端
	cd backend && python server.py

dev-frontend: ## 仅启动前端
	npm run dev

# ── 测试 ──

test: test-backend test-frontend ## 运行全部测试

test-backend: ## 运行后端测试
	cd backend && python -m pytest tests/ --timeout=60 --ignore=tests/legacy -q

test-frontend: ## 运行前端测试
	npx vitest run

test-orchestrator: ## 运行编排器测试
	cd orchestrator && npm test

# ── 代码质量 ──

lint: ## 运行 lint
	npx biome check src/

typecheck: ## TypeScript 类型检查
	npx tsc --noEmit

# ── 评测基准 ──

benchmark: ## 运行评测基准（全部）
	cd backend && python benchmark_cli.py

benchmark-simple: ## 运行 simple 类评测
	cd backend && python benchmark_cli.py --category simple

benchmark-baseline: ## 对比基线检测回归
	cd backend && python benchmark_cli.py --baseline ../baselines/v2.0.0.json

benchmark-gate: ## CI 门禁（无 key 自检）
	cd backend && python benchmark_gate.py

benchmark-gate-llm: ## CI 门禁（真实 LLM）
	cd backend && python benchmark_gate.py --with-llm

# ── 构建 ──

build: ## 构建前端
	npm run build

# ── 数据库 ──

db-backup: ## 备份数据库
	cd backend && python -c "from ops import OpsManager; print(OpsManager('data').backup_database())"

db-stats: ## 数据库统计
	cd backend && python -c "from agent_profile_manager import AgentProfileManager; p=AgentProfileManager('data/agent_profiles'); print(f'Agents: {len(p.list_profiles())}')"

# ── 清理 ──

clean: ## 清理临时文件
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
	rm -rf dist/ build/
