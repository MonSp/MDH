# Checklist

## SkillRegistry 技能注册中心
- [x] `backend/skill_registry.py` 文件存在且包含 `SkillPackage` 数据类和 `SkillRegistry` 类
- [x] 技能包目录结构验证逻辑正确检查 manifest.yaml、system_prompt.md、tools/、knowledge/、examples/
- [x] `register()` 方法能正确解析 manifest 并分配唯一 skill_id 和版本号
- [x] `clone()` 方法能将基础技能包完整复制到目标目录
- [x] `list_skills()` 方法返回所有已注册技能包列表
- [x] `get_versions()` 方法返回指定技能包的版本列表
- [x] `create_incremental_area()` 方法能创建完整的增量区目录结构
- [x] `backend/tests/test_skill_registry.py` 测试全部通过

## ProjectManager 项目生命周期管理
- [x] `backend/project_manager.py` 文件存在且包含 `Project` 数据类和 `ProjectManager` 类
- [x] `create_project()` 方法生成唯一项目 ID 并创建项目目录
- [x] `instantiate_project()` 方法能从 SkillRegistry 克隆技能包并创建员工实例记录
- [x] `get_project_status()` 方法返回完整的项目状态信息
- [x] `archive_project()` 方法触发 SkillPackager 打包并清理员工实例
- [x] `list_projects()` 方法返回所有项目列表
- [x] `backend/tests/test_project_manager.py` 测试全部通过

## ExperienceExtractor 经验提炼器
- [x] `backend/experience_extractor.py` 文件存在且包含 `ExperienceRule` 数据类和 `ExperienceExtractor` 类
- [x] `extract_from_success()` 方法能从成功日志中提取条件-动作规则
- [x] `extract_from_failure_recovery()` 方法能从失败-修正交互对中提取规则
- [x] `write_to_incremental_area()` 方法能将规则以 YAML 格式写入增量区
- [x] `retrieve_relevant_rules()` 方法能根据任务特征检索相关规则
- [x] `build_experience_context()` 方法能将规则格式化为可注入的提示文本
- [x] 经验审核流程（submit/approve/reject/modify）工作正常
- [x] `backend/tests/test_experience_extractor.py` 测试全部通过

## SkillPackager 技能打包器
- [x] `backend/skill_packager.py` 文件存在且包含 `PackageResult` 数据类和 `SkillPackager` 类
- [x] `merge_skills()` 方法按策略正确合并基础包和增量区（system_prompt 追加、工具替换/新增、规则合并）
- [x] `desensitize_check()` 方法能检测并移除 API 密钥、内部路径、隐私数据模式
- [x] `generate_readme()` 方法自动生成包含进化点说明的 README
- [x] `package_zip()` 方法生成格式正确的 `{project_id}_skills_v2.0.zip` 文件
- [x] `preview_package()` 方法返回技能包结构树和 diff 摘要
- [x] SkillPackager 集成到 ProjectManager 的 `archive_project()` 流程中
- [x] `backend/tests/test_skill_packager.py` 测试全部通过

## DynamicRouter 动态路由器
- [x] `backend/dynamic_router.py` 文件存在且包含 `RouteEntry` 数据类和 `DynamicRouter` 类
- [x] 路由表能从 JSON 文件正确加载并缓存到内存
- [x] `rule_match()` 方法能基于关键词和能力标签过滤候选部门
- [x] `semantic_rank()` 方法能按语义相似度对候选部门排序
- [x] `route()` 方法综合规则匹配 + 语义排序 + 历史成功率选出最佳目标
- [x] `update_stats()` 方法能正确更新部门的历史成功率和活跃时间
- [x] DynamicRouter 集成到 `meeting_coordinator.py` 的 `semantic_analyze()` 中
- [x] `backend/tests/test_dynamic_router.py` 测试全部通过

## 结构化反馈与迭代闭环
- [x] PlannerAgent 的 `SubTask` 数据类包含 `acceptance_criteria`、`required_skills`、`input_spec`、`output_spec` 字段
- [x] `_decompose_task()` 方法在生成子任务时填充新增字段
- [x] 任务分配逻辑关联 SkillRegistry 查询匹配技能
- [x] ExecutorAgent 构造函数支持 `base_skill_path` 和 `incremental_path` 参数
- [x] ExecutorAgent 执行前自动检索并注入相关经验规则
- [x] `handle_revision_feedback()` 方法能解析结构化反馈 JSON 并逐项修正
- [x] 迭代修正循环正确执行：提交→验收→反馈→修正→再提交，达到 max_iterations 时终止
- [x] 每轮迭代结束后自动调用 ExperienceExtractor 提炼经验
- [x] 验收反馈输出为结构化 JSON：`{ status, issues, max_iterations }`
- [x] `backend/tests/test_iteration_loop.py` 集成测试全部通过

## 前端 UI 组件
- [x] `src/modules/agentTypes.ts` 包含 `SkillPackage`、`Project`、`ExperienceRule`、`RouteEntry` 类型定义
- [x] `src/modules/skillRegistry.ts` 正确封装 SkillRegistry API 调用
- [x] `src/modules/projectManager.ts` 正确封装 ProjectManager API 调用
- [x] `src/modules/experienceExtractor.ts` 正确封装 ExperienceExtractor API 调用
- [x] `src/modules/skillPackager.ts` 正确封装 SkillPackager API 调用
- [x] `src/components/skill-evolution/SkillRegistryPanel.tsx` 展示技能包列表和版本历史
- [x] `src/components/skill-evolution/ProjectListPanel.tsx` 展示项目列表和状态
- [x] `src/components/skill-evolution/ExperienceRulePanel.tsx` 展示经验规则列表和审核操作
- [x] `src/components/skill-evolution/SkillPackagePreview.tsx` 展示技能包结构和 diff
- [x] `src/components/skill-evolution/index.ts` 统一导出所有组件

## API 路由集成
- [x] GET /api/skills 返回技能包列表
- [x] POST /api/skills 注册新技能包
- [x] POST /api/skills/{id}/clone 克隆技能包
- [x] GET /api/skills/{id}/versions 返回版本列表
- [x] GET /api/projects 返回项目列表
- [x] POST /api/projects 创建项目
- [x] GET /api/projects/{id}/status 返回项目状态
- [x] POST /api/projects/{id}/archive 归档项目
- [x] POST /api/experience/extract 提炼经验
- [x] GET /api/experience/rules 返回规则列表
- [x] POST /api/experience/rules/{id}/approve 审核规则
- [x] POST /api/skills/package 打包技能
- [x] GET /api/skills/package/{id}/preview 预览技能包
- [x] GET /api/router/table 返回路由表
- [x] PUT /api/router/table 更新路由表
