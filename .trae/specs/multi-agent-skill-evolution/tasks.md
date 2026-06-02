# Tasks

## Phase 1: 后端基础服务（SkillRegistry + ProjectManager）

### Task 1: 实现 SkillRegistry 技能注册中心
- [x] 1.1 创建 `backend/skill_registry.py`，定义 `SkillPackage` 数据类（含 name, version, manifest, base_path, created_at）
- [x] 1.2 实现标准化技能包目录结构验证：检查 manifest.yaml、system_prompt.md、tools/、knowledge/、examples/ 是否存在
- [x] 1.3 实现 `register()` 方法：解析 manifest.yaml，分配唯一 skill_id 和版本号，注册到内存索引
- [x] 1.4 实现 `clone()` 方法：将基础技能包完整复制到指定目标目录，返回克隆路径
- [x] 1.5 实现 `list_skills()` 方法：返回所有已注册技能包列表及版本信息
- [x] 1.6 实现 `get_versions()` 方法：返回指定技能包的所有版本列表和变更摘要
- [x] 1.7 实现 `create_incremental_area()` 方法：在指定路径创建增量区目录结构（rules/、tools/、knowledge_add/、system_prompt_addon.md）

### Task 2: 实现 ProjectManager 项目生命周期管理
- [x] 2.1 创建 `backend/project_manager.py`，定义 `Project` 数据类（含 project_id, name, status, brief, created_at, skill_packages, employees）
- [x] 2.2 实现 `create_project()` 方法：生成唯一项目 ID，创建项目目录，保存项目简报上下文
- [x] 2.3 实现 `instantiate_project()` 方法：接收 DAG 描述，为每个子任务从 SkillRegistry 克隆技能包，创建员工实例记录并挂载基础包 + 增量区
- [x] 2.4 实现 `get_project_status()` 方法：返回项目阶段、各子任务状态、迭代次数、技能增量统计
- [x] 2.5 实现 `archive_project()` 方法：触发 SkillPackager 打包，清空员工短期记忆，保留项目日志，销毁员工实例记录
- [x] 2.6 实现 `list_projects()` 方法：返回所有项目列表及状态

### Task 3: SkillRegistry 与 ProjectManager 集成到 server.py
- [x] 3.1 在 `backend/server.py` 中注册 SkillRegistry 的 REST API 路由：GET/POST /api/skills, POST /api/skills/{id}/clone, GET /api/skills/{id}/versions
- [x] 3.2 在 `backend/server.py` 中注册 ProjectManager 的 REST API 路由：GET/POST /api/projects, GET /api/projects/{id}/status, POST /api/projects/{id}/archive
- [x] 3.3 在系统启动时初始化 SkillRegistry 实例（扫描 skills 目录自动注册已有技能）和 ProjectManager 实例
- [x] 3.4 为 Task 1 和 Task 2 编写单元测试：`backend/tests/test_skill_registry.py` 和 `backend/tests/test_project_manager.py`

---

## Phase 2: 经验提炼器（ExperienceExtractor）

### Task 4: 实现 ExperienceExtractor 经验提炼器
- [x] 4.1 创建 `backend/experience_extractor.py`，定义 `ExperienceRule` 数据类（含 rule_id, trigger_condition, action, note, source_task, approved）
- [x] 4.2 实现 `extract_from_success()` 方法：解析成功执行日志，提取关键步骤模式，生成条件-动作规则
- [x] 4.3 实现 `extract_from_failure_recovery()` 方法：解析失败→修正的交互对，生成"当遇到 X 时执行 Y"的规则
- [x] 4.4 实现 `write_to_incremental_area()` 方法：将审核通过的规则以 YAML 格式写入技能增量区的 rules/ 目录
- [x] 4.5 实现 `retrieve_relevant_rules()` 方法：根据任务特征（关键词、类型）从增量区检索相关经验规则，返回排序列表
- [x] 4.6 实现 `build_experience_context()` 方法：将检索到的规则格式化为可注入到员工提示中的上下文文本

### Task 5: 经验审核流程
- [x] 5.1 在 `backend/experience_extractor.py` 中实现 `submit_for_review()` 方法：将新规则标记为 pending_review 状态
- [x] 5.2 实现 `approve_rule()` / `reject_rule()` / `modify_rule()` 方法：领导智能体审核操作
- [x] 5.3 在 `backend/server.py` 中注册 ExperienceExtractor API 路由：POST /api/experience/extract, GET /api/experience/rules, POST /api/experience/rules/{id}/approve
- [x] 5.4 编写单元测试：`backend/tests/test_experience_extractor.py`

---

## Phase 3: 技能打包器（SkillPackager）

### Task 6: 实现 SkillPackager 技能打包器
- [x] 6.1 创建 `backend/skill_packager.py`，定义 `PackageResult` 数据类（含 package_path, readme_content, desensitize_report, diff_summary）
- [x] 6.2 实现 `merge_skills()` 方法：读取基础技能包和增量区，按策略合并（system_prompt 追加、工具替换/新增、规则直接合并）
- [x] 6.3 实现 `desensitize_check()` 方法：扫描合并后的技能包，检测并移除 API 密钥模式、内部路径、用户隐私数据模式
- [x] 6.4 实现 `generate_readme()` 方法：自动生成 README.md，包含技能包进化点说明、新增规则摘要、适用场景
- [x] 6.5 实现 `package_zip()` 方法：将合并后的技能包压缩为 `{project_id}_skills_v2.0.zip`，返回文件路径
- [x] 6.6 实现 `preview_package()` 方法：返回技能包结构树、相对于基础版的 diff、新增规则列表

### Task 7: SkillPackager 集成与测试
- [x] 7.1 在 `backend/server.py` 中注册 SkillPackager API 路由：POST /api/skills/package, GET /api/skills/package/{id}/preview
- [x] 7.2 将 SkillPackager 集成到 ProjectManager 的 `archive_project()` 流程中
- [x] 7.3 编写单元测试：`backend/tests/test_skill_packager.py`

---

## Phase 4: 动态路由器（DynamicRouter）

### Task 8: 实现 DynamicRouter 动态路由器
- [x] 8.1 创建 `backend/dynamic_router.py`，定义 `RouteEntry` 数据类（含 dept_id, capability_desc, tools, success_rate, last_active）
- [x] 8.2 实现 `load_routing_table()` 方法：从 JSON 文件加载路由表，支持运行时内存缓存
- [x] 8.3 实现 `rule_match()` 方法：基于关键词和能力标签过滤候选部门列表
- [x] 8.4 实现 `semantic_rank()` 方法：对候选部门按语义相似度排序（使用 LLM embedding 或关键词匹配）
- [x] 8.5 实现 `route()` 方法：综合规则匹配 + 语义排序 + 历史成功率，选出最佳路由目标
- [x] 8.6 实现 `update_stats()` 方法：项目完成/失败后更新对应部门的成功率和活跃时间

### Task 9: DynamicRouter 集成到 MeetingCoordinator
- [x] 9.1 修改 `backend/meeting_coordinator.py`，在 `semantic_analyze()` 中集成 DynamicRouter 路由决策
- [x] 9.2 在路由决策完成后调用 `update_stats()` 持久化结果
- [x] 9.3 在 `backend/server.py` 中注册 DynamicRouter API 路由：GET /api/router/table, PUT /api/router/table
- [x] 9.4 编写单元测试：`backend/tests/test_dynamic_router.py`

---

## Phase 5: 结构化反馈与迭代闭环

### Task 10: PlannerAgent DAG 增强
- [x] 10.1 修改 `backend/collaboration/planner_agent.py`，`SubTask` 数据类增加 `acceptance_criteria`、`required_skills`、`input_spec`、`output_spec` 字段
- [x] 10.2 修改 `_decompose_task()` 方法，在生成子任务时填充新增字段
- [x] 10.3 修改任务分配逻辑，关联 SkillRegistry 查询匹配技能标签

### Task 11: ExecutorAgent 迭代修正闭环
- [x] 11.1 修改 `backend/collaboration/executor_agent.py`，构造函数增加 `base_skill_path` 和 `incremental_path` 参数
- [x] 11.2 在任务执行前调用 ExperienceExtractor 的 `retrieve_relevant_rules()` 检索相关经验并注入提示
- [x] 11.3 实现 `handle_revision_feedback()` 方法：接收结构化反馈 JSON，逐项解析 issues 并修正
- [x] 11.4 实现迭代修正循环：提交→验收→反馈→修正→再提交，直到通过或达到 max_iterations
- [x] 11.5 每轮迭代结束后调用 ExperienceExtractor 提炼经验

### Task 12: 验收反馈结构化
- [x] 12.1 在 `backend/collaboration/planner_agent.py` 中实现结构化验收反馈生成：输出 `{ status, issues: [{ type, location, detail, suggestion }], max_iterations }` JSON
- [x] 12.2 修改 `backend/meeting_coordinator.py` 中的 `review_task_execution()` 使用结构化反馈格式
- [x] 12.3 编写集成测试：`backend/tests/test_iteration_loop.py`，验证完整的员工迭代修正闭环

---

## Phase 6: 前端 UI 组件

### Task 13: 前端类型定义与模块
- [x] 13.1 在 `src/modules/agentTypes.ts` 中新增 `SkillPackage`、`Project`、`ExperienceRule`、`RouteEntry` 类型定义
- [x] 13.2 创建 `src/modules/skillRegistry.ts`：封装 SkillRegistry API 调用（listSkills, cloneSkill, getVersions）
- [x] 13.3 创建 `src/modules/projectManager.ts`：封装 ProjectManager API 调用（createProject, getProjectStatus, archiveProject, listProjects）
- [x] 13.4 创建 `src/modules/experienceExtractor.ts`：封装 ExperienceExtractor API 调用（getRules, approveRule）
- [x] 13.5 创建 `src/modules/skillPackager.ts`：封装 SkillPackager API 调用（packageSkills, previewPackage）

### Task 14: 技能进化 UI 面板
- [x] 14.1 创建 `src/components/skill-evolution/SkillRegistryPanel.tsx`：展示技能包列表、版本历史、克隆操作
- [x] 14.2 创建 `src/components/skill-evolution/ProjectListPanel.tsx`：展示项目列表、状态、归档操作
- [x] 14.3 创建 `src/components/skill-evolution/ExperienceRulePanel.tsx`：展示经验规则列表、审核操作、规则详情
- [x] 14.4 创建 `src/components/skill-evolution/SkillPackagePreview.tsx`：展示技能包结构树、diff、新增规则
- [x] 14.5 创建 `src/components/skill-evolution/index.ts`：统一导出组件

---

## Task Dependencies

- Task 1（SkillRegistry）可立即开始，无依赖
- Task 2（ProjectManager）依赖 Task 1（需要 SkillRegistry 的 clone 接口）
- Task 3（API 集成）依赖 Task 1 + Task 2
- Task 4（ExperienceExtractor）可与 Task 1-2 并行
- Task 5（经验审核）依赖 Task 4
- Task 6（SkillPackager）可与 Task 4-5 并行，但需要 Task 1 的技能包结构定义
- Task 7（SkillPackager 集成）依赖 Task 6 + Task 3
- Task 8（DynamicRouter）可与 Task 1-6 并行
- Task 9（DynamicRouter 集成）依赖 Task 8
- Task 10（PlannerAgent 增强）依赖 Task 1（需要 SkillRegistry 查询接口）
- Task 11（ExecutorAgent 增强）依赖 Task 4 + Task 10
- Task 12（结构化反馈）依赖 Task 10 + Task 11
- Task 13（前端类型与模块）依赖 Task 3（API 路由定义确定后）
- Task 14（前端 UI）依赖 Task 13

### 可并行执行的任务组
- **并行组 A**: Task 1 + Task 4 + Task 8（三个独立后端服务可并行开发）
- **串行依赖链**: Task 1 → Task 2 → Task 3 → Task 7
- **串行依赖链**: Task 4 → Task 5
- **串行依赖链**: Task 8 → Task 9
- **串行依赖链**: Task 1 → Task 10 → Task 11 → Task 12
- **串行依赖链**: Task 3 → Task 13 → Task 14
