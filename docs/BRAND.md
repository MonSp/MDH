# MDH 大荒界 · 智能体世界

## 品牌定位

MDH 大荒界是一个统一的智能体世界平台。AI agent 不是一次性工具，而是持续进化的数字员工——它们有自己的技能、记忆、经验、职业发展，并在虚拟世界中以 NPC 形式存在。

## 产品矩阵

| 产品 | 定位 | 技术栈 | 仓库 |
|------|------|--------|------|
| MDH-Company | 数字员工操作系统（管理后台） | Python FastAPI + React | [MDH](https://github.com/MonSp/MDH) |
| MDH-Game | 太古纪元：霸业（玩家前端） | TypeScript + C++ ECS + React | [MyGame](https://github.com/MonSp/MyGame) |
| agent-kernel | 共享智能体内核 | C++17 ECS | (子目录) |

## 共享内核

C++ ECS agent-kernel 是两个产品的 Single Source of Truth：
- AgentProfile (身份/属性/状态)
- SkillTree (42技能 + 依赖树 + 等级)
- Memory (三级记忆：短期→中期→长期)
- XP & Career (经验值 + 职业晋升)
- Evolution (进化历史 + 规则有效性)

## 技能映射

Company 的42个真实技能通过映射表翻译为 Game 世界能力，命名遵循 Game 世界观规范（功法/炼丹/阵法/符箓/禁制/机关）：
- `backend_dev` → `阵法`
- `frontend_dev` → `符箓`
- `testing` → `试炼`
- `ml_engineering` → `炼丹`
- `security_audit` → `禁制`
- `devops` → `机关`
- ...详见 `agent-kernel/config/skill-mapping.json`
