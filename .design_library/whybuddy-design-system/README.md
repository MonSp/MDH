# 大荒界 MDH 设计系统

## 概述

从 大荒界 Matrix DaHuang (MDH) 多智能体协作平台提取的设计系统，包含完整的颜色 Token、排版规范和组件库。支持亮色/暗色双主题，以暗色科技风格为主。

---

## Token 清单

### 颜色系统

**语义强调色** — 6 组，每组含标准色和 dim 透明色：

| Token              | 亮色值                   | 暗色值                   |
| ------------------ | ------------------------ | ------------------------ |
| `--blue`           | `#2563eb`                | `#4d9fff`                |
| `--blue-dim`       | `rgba(37,99,235,0.08)`   | `rgba(77,159,255,0.1)`   |
| `--cyan`           | `#0891b2`                | `#3dd6c8`                |
| `--cyan-dim`       | `rgba(8,145,178,0.08)`   | `rgba(61,214,200,0.1)`   |
| `--purple`         | `#7c3aed`                | `#a78bfa`                |
| `--purple-dim`     | `rgba(124,58,237,0.08)` | `rgba(167,139,250,0.1)`  |
| `--amber`          | `#d97706`                | `#f59e0b`                |
| `--amber-dim`      | `rgba(217,119,6,0.08)`   | `rgba(245,158,11,0.1)`   |
| `--green`          | `#059669`                | `#34d399`                |
| `--green-dim`      | `rgba(5,150,105,0.08)`   | `rgba(52,211,153,0.1)`   |
| `--red`            | `#dc2626`                | `#f87171`                |
| `--red-dim`        | `rgba(220,38,38,0.06)`   | `rgba(248,113,113,0.1)`  |

### 背景层级

从页面底色到浮层，逐级递进：

| Token              | 亮色值                          | 暗色值                          |
| ------------------ | ------------------------------- | ------------------------------- |
| `--bg-deep`        | `#f7f4ef`                       | `#050b14`                       |
| `--bg-elevated`    | `rgba(255,252,248,0.92)`        | `rgba(15,25,45,0.85)`           |
| `--bg-input`       | `rgba(250,247,242,0.9)`         | `rgba(8,14,26,0.8)`             |

### 边框层级

| Token              | 亮色值                     | 暗色值                      |
| ------------------ | -------------------------- | --------------------------- |
| `--border-card`    | `rgba(0,0,0,0.06)`        | `rgba(90,140,210,0.12)`    |
| `--border-glow`    | `rgba(0,0,0,0.08)`        | `rgba(90,140,210,0.22)`    |

### 文字层级

| Token              | 亮色值     | 暗色值     |
| ------------------ | ---------- | ---------- |
| `--text-primary`   | `#1c1917`  | `#e2e8f0`  |
| `--text-secondary` | `#78716c`  | `#8899b4`  |
| `--text-muted`     | `#a8a29e`  | `#4a5575`  |

### 部门色

10 个部门各有主色 + 强调色：

| 部门       | 主色 Token                  | 强调色 Token                     |
| ---------- | --------------------------- | -------------------------------- |
| Software   | `--dept-software` `#0a84ff` | `--dept-software-accent` `#64d2ff` |
| AI Movie   | `--dept-ai-movie` `#ff375f` | `--dept-ai-movie-accent` `#ff6b8a` |
| Data       | `--dept-data` `#bf5af2`     | `--dept-data-accent` `#d4a0ff`     |
| Content    | `--dept-content` `#ff9f0a`  | `--dept-content-accent` `#ffb340`  |
| PPT        | `--dept-ppt` `#30d158`      | `--dept-ppt-accent` `#5e9e6b`      |
| Marketing  | `--dept-marketing` `#34c759`| `--dept-marketing-accent` `#5e9e6b`|
| Sales      | `--dept-sales` `#ff9500`    | `--dept-sales-accent` `#ffb340`    |
| Design     | `--dept-design` `#af52de`   | `--dept-design-accent` `#d4a0ff`   |
| Product    | `--dept-product` `#5856d6`  | `--dept-product-accent` `#8b83ff`  |
| Finance    | `--dept-finance` `#63e6be`  | `--dept-finance-accent` `#a7f3d0`  |

### 角色色

6 个角色各有主题色 + 渐变起止色：

| 角色         | 主题色 Token              | 渐变起止 Token                                  |
| ------------ | ------------------------- | ----------------------------------------------- |
| CEO          | `--role-ceo` `#e11d48`    | `--role-ceo-gradient-start` / `-end` `#e11d48` → `#f43f5e` |
| Planner      | `--role-planner` `#8b5cf6`| `--role-planner-gradient-start` / `-end` `#8b5cf6` → `#a78bfa` |
| Executor     | `--role-executor` `#f59e0b`| `--role-executor-gradient-start` / `-end` `#f59e0b` → `#fbbf24` |
| Monitor      | `--role-monitor` `#10b981`| `--role-monitor-gradient-start` / `-end` `#10b981` → `#34d399` |
| Reviewer     | `--role-reviewer` `#3b82f6`| `--role-reviewer-gradient-start` / `-end` `#3b82f6` → `#60a5fa` |
| Coordinator  | `--role-coordinator` `#ec4899`| `--role-coordinator-gradient-start` / `-end` `#ec4899` → `#f472b6` |

### 状态色

| Token              | 值         |
| ------------------ | ---------- |
| `--status-active`    | `#30d158`  |
| `--status-completed` | `#bf5af2`  |
| `--status-planning`  | `#0a84ff`  |

### 排版

| Token          | 值                                                                 |
| -------------- | ------------------------------------------------------------------ |
| `--font-sans`  | `'Noto Sans SC', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` |
| `--font-mono`  | `'JetBrains Mono', 'Cascadia Code', monospace`                     |

### 圆角

| Token          | 值     |
| -------------- | ------ |
| `--radius-sm`  | `6px`  |

### 动效

| Token          | 值                                  |
| -------------- | ----------------------------------- |
| `--ease-out`   | `cubic-bezier(0.16, 1, 0.3, 1)`    |

### 玻璃态

| Token          | 亮色值  | 暗色值  |
| -------------- | ------- | ------- |
| `--glass-blur` | `20px`  | `16px`  |

---

## 命名规范

- **源 Token**: 保留项目原始命名（`--bg-deep`、`--blue`、`--text-primary` 等），与 大荒界 MDH 代码库保持一致。
- **便携别名**: `--color-*` 格式（如 `--color-text-primary`、`--color-accent-blue`），供组件和预览页面使用。
- 所有便携别名均通过 `var()` 引用源 Token，不引入新色值，确保主题切换时自动继承。

---

## 主题切换

- `:root` — 亮色主题（默认声明）
- `.dark` — 暗色主题覆盖
- 暗色为默认/主要体验，暗色模式下语义强调色自动提亮、背景转为深蓝黑色调

---

## 组件列表

| 组件             | 说明                       |
| ---------------- | -------------------------- |
| **Button**       | 主操作 / 次操作 / 幽灵按钮 |
| **Card**         | 玻璃态仪表盘卡片           |
| **Input**        | 设置面板风格表单输入       |
| **Status Badge** | 状态指示胶囊               |
| **Agent Card**   | 角色主题智能体卡片         |
| **Progress Bar** | 多尺寸进度条               |

---

## 使用示例

### 引入 CSS

```html
<link rel="stylesheet" href="colors_and_type.css">
```

### 切换暗色主题

在 `<body>` 或 `<html>` 上添加 `class="dark"`：

```html
<body class="dark">
  <!-- 页面内容 -->
</body>
```

### 使用 Token

推荐使用便携别名：

```css
.my-element {
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
}
```

也可直接使用源 Token：

```css
.my-element {
  color: var(--text-primary);
  background: var(--bg-elevated);
}
```
