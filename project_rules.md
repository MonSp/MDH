# Project Rules

## 重要规则

### 1. 子模块保护规则
**绝对不要在 `third_party/agentscope` 子模块中添加或修改任何代码！**

**正确做法：**
- 所有新功能代码都应该添加到主项目目录中（如 `src/` 目录）
- 如果需要扩展子模块的功能，应该：
  1. 在主项目中创建包装器或适配器
  2. 通过继承或组合的方式扩展功能

### 2. 代码组织规则
- 前端代码：`src/` 目录
- 后端代码：`backend/` 目录
- 第三方依赖：`third_party/` 目录（子模块）
- 配置文件：项目根目录
- 文档：项目根目录或 `docs/` 目录

### 3. 依赖管理规则
- 前端依赖：使用 `package.json` 管理
- 后端依赖：使用 `requirements.txt` 或 `pyproject.toml` 管理
- 子模块更新：使用 `git submodule update --remote`

### 4. 测试规则
- 前端测试：`src/` 目录下的 `*.test.ts` 或 `*.spec.ts` 文件
- 后端测试：`tests/` 目录（主项目的测试目录，不是子模块的）
- 子模块测试：不要修改，保持原样

### 5. 提交规则
- 提交前检查：`git status` 确保没有意外修改子模块
- 如果发现子模块被修改：`git checkout third_party/agentscope` 恢复原状
- 提交信息：清晰描述修改内容和原因

## 违规处理
如果发现有人在子模块中添加了代码：
1. 立即恢复子模块到原始状态：`git submodule update --force`
2. 将代码移动到正确的位置
3. 更新相关文档和测试