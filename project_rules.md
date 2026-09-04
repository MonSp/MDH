# Project Rules

## 重要规则

### 1. 代码组织规则
- 前端代码：`src/` 目录
- 后端代码：`backend/` 目录
- 第三方依赖：`third_party/` 目录
- 配置文件：项目根目录
- 文档：项目根目录或 `docs/` 目录

### 2. 依赖管理规则
- 前端依赖：使用 `package.json` 管理
- 后端依赖：使用 `requirements.txt` 或 `pyproject.toml` 管理

### 3. 测试规则
- 前端测试：`src/` 目录下的 `*.test.ts` 或 `*.spec.ts` 文件
- 后端测试：`tests/` 目录

### 4. 提交规则
- 提交前检查：`git status` 确保没有意外修改
- 提交信息：清晰描述修改内容和原因