# Changelog

本项目所有值得记录的改动。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-08-16

### Added

**会议纪要任务全链路（真实试点，7/7 验收 PASS）**
- 纪要意图识别文档模式 → 会议纪要 DAG 工作流（提取/起草/校对节点）→ 节点执行 → 产出物落盘（`minutes_workflow.py` / `pilot_minutes.py`）
- 纪要转录注入节点输入、gate 序列化补齐（workflow_node_to_dict / dict_to_workflow_node 回环）

**资产沉淀闭环（M3/M4）**
- `AssetStore`：三类资产（产出物 artifacts / 模板 templates / 技能规则 rules）团队级文件系统存储 + 原子写 + 判重
- `AssetEvaluator`：确定性四检查 + 可注入 LLM judge seam（fail-closed）
- 模板固化流程：`TemplateConfirmation` 消费侧桥接 ApprovalManager gate 决定 → 入库（员工审批把关）
- 技能进化：`SkillEvolution.evolve_from_feedback` 把关差异提炼 → 增量区（`write_to_incremental_area`）；`modify_rule` 公开元数据更新 API（allowed_fields 含 source_task_type/team_id）
- 资产检索 `AssetSearch`：三类资产合并检索 + 团队隔离

**LLM judge 评测与基准**
- `make_llm_judge` / `make_judge_from_env`（DeepSeek OpenAI 兼容端点，CJK 数字解析修复）
- 演示端点接线：`ASSET_JUDGE_ENABLED` env 开关 → 真实 judge 惰性单例（真实 key 端点试点 5/5 PASS）
- 评测基准：内置标注集 + `evaluate_judge` 五指标 + `load_benchmark_items` 外部 JSON 加载（`benchmark_items.example.json` + parity 测试）
- CI 质量门禁：`asset_benchmark_gate.py`（三阈值 vs 五指标 + 基线记录 + 无 key 确定性自检）+ GitHub Actions 接入示例文档

**资产复用注入（M4）**
- `AssetContextBuilder`：DAG 节点 prompt"资产参考"段（模板/知识/技能规则节选，渐进披露 caps）
- 生产 team_id 通道：`process_user_message` → `semantic_analyze` → `analyze` 三层尾置透传 → 纪要工作流节点 input_spec（空 team_id 形状零变化）
- llm_cache 团队隔离：`semantic_analyze` team_id 非空时绕过缓存（跨团队 TTL 不丢 team_id）
- 真实纪要注入试点：`pilot_asset_injection.py` 预置资产 + 重注册 executor → 注入 3/3 vs 空团队 0/3 对照 PASS

**规则级团队隔离**
- `ExperienceRule.team_id` 字段 + YAML 序列化（旧规则缺键容错）+ `retrieve_relevant_rules` 团队过滤（空=全局向后兼容）
- `migrate_rules_team_id`：存量规则批量回填（115 条真实规则迁移至 team-x，幂等 + 空目标守卫）

**M5 资产可视化与复用可感知**
- 前端资产浏览面板 `AssetBrowserPanel`：团队选择/检索（参数化 task_type+keywords）/产出物·模板·技能规则三块列表（状态徽章 + judge_score + 审批人/创建时间）/空态；挂载于 OfficeTeamMode `🧠 资产` 标签
- 复用率指标：`build_asset_context` 注入计数（total/by_team/by_type/last_at）+ `GET /api/assets/reuse-metrics` 端点 + 线程安全（`_REUSE_LOCK`）+ JSON 落盘持久化（重启恢复，build 前加载）
- 共享前端 API 工具 `apiFetch`（`_ok` 解包 + success 守卫 + init 守卫）

**其他**
- 员工目录 `EmployeeDirectory`（emp-id → 显示名解析，gate/审批显示 approverName）
- SMTP 邮件发送（标准库 smtplib + 显式 timeout + STARTTLS 支持评估）
- 审批面板增强（gate approver/task/gate 上下文显示）
- 低严重度收尾：试点脚本健壮性（`--verbose` / 端口预检）、`.env.example` 文档化 `ASSET_JUDGE_ENABLED`

### Fixed

- llm_cache 跨团队泄漏：同消息不同团队 300s TTL 命中返回旧 team_id 结果（`semantic_analyze` team_id 非空绕过缓存）
- 技能规则注入跨团队泄漏：`retrieve_relevant_rules` 全局检索 → 团队过滤（fail-closed：`team_id=""` 旧规则对团队检索不可见，存量迁移解决）
- 面板崩溃：后端 `_fail`（HTTP 200 + success:false）被 `res.ok` 守卫漏过 → `apiFetch` success 守卫
- 资产浏览 search 合并双渲染（同源列表）→ merged 按 id 去重
- 团队切换残留（旧 search/旧列表）→ effect 顶部清空
- 复用统计重启覆盖：`build_asset_context` 计数前未加载落盘值 → `_ensure_loaded()` 前置
- 复用统计并发丢失自增：模块级 dict 无锁 → `_REUSE_LOCK`（含保存全程 tmp 竞态）
- 评测基准外部标注集 StopIteration：perfect judge 基于传入 items
- `"gold_score": true` 被静默接受为 1.0（bool 是 int 子类）→ 数值校验显式排除 bool
- 演示端点非字符串 JSON 值未捕获 500 → `_fail` 统一兜底
- CJK 相邻数字解析：`\b` 边界误判（`0.85分` → 0.0）→ digit lookaround 正则

### Changed

- `SemanticAnalyzer.analyze` / `MeetingCoordinator.semantic_analyze` / `process_user_message` 增加尾置 `team_id` 参数（默认空，形状零变化——8 个生产调用方零影响）
- `build_minutes_workflow` 增加尾置 `team_id` 透传（节点 input_spec）
- `modify_rule` allowed_fields 扩展（source_task_type / team_id）——`_save_rule` 不再被跨模块直调
- `ExperienceExtractor.retrieve_relevant_rules` / `evolve_from_feedback` 增加 team_id 参数（空=全局向后兼容）
- 最终交付报告 `docs/compose/reports/hybrid-team-platform.md` 更新至 commits d069ab6..70c7dd3（含 18 项计划/规格 NOTE 标记）

### Removed

- （无破坏性移除）

## [1.0.0] - 2026-08-14

- 初始版本基线：P3 阶段（M1 引擎底座 / M2a 会议纪要后端全链路 / M2b 把关强制力与 SMTP / M2b-2 前端把关 UI）——详见 `docs/compose/reports/hybrid-team-platform.md`（commits d069ab6..2f91173 区间交付）
