# 大荒界 MDH Design System — SKILL.md

> Multi-agent collaboration platform design system. Dark-first tech aesthetic with glassmorphism, subtle gradients, and neon accents.

---

## 1. Brand Essentials

| Property       | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Product type   | Dashboard (multi-agent collaboration platform)               |
| Visual tone    | Dark-first tech platform with glassmorphism, subtle gradients, and neon accents |
| Personality    | Tech-forward, collaborative, professional                   |
| Language       | zh (Chinese UI)                                             |
| Kit type       | dashboard                                                    |

---

## 2. Token Reference

### 2.1 Background Tokens

| Token              | Light Value                        | Dark Value                         | Alias                    |
| ------------------ | ---------------------------------- | ---------------------------------- | ------------------------ |
| `--bg-deep`        | `#f7f4ef`                          | `#050b14`                          | `--color-bg-base`        |
| `--bg-elevated`    | `rgba(255, 252, 248, 0.92)`        | `rgba(15, 25, 45, 0.85)`          | `--color-bg-elevated`    |
| `--bg-input`       | `rgba(250, 247, 242, 0.9)`         | `rgba(8, 14, 26, 0.8)`            | `--color-bg-input`       |
| `--header-bg`      | `rgba(255, 252, 248, 0.88)`        | `rgba(8, 14, 26, 0.7)`            | `--color-bg-header`      |
| `--input-bar-bg`   | `rgba(255, 252, 248, 0.88)`        | `rgba(8, 14, 26, 0.7)`            | `--color-bg-input-bar`   |

### 2.2 Border Tokens

| Token               | Light Value              | Dark Value                    | Alias                       |
| ------------------- | ------------------------ | ----------------------------- | --------------------------- |
| `--border-card`     | `rgba(0, 0, 0, 0.06)`   | `rgba(90, 140, 210, 0.12)`   | `--color-border-default`    |
| `--border-glow`     | `rgba(0, 0, 0, 0.08)`   | `rgba(90, 140, 210, 0.22)`   | `--color-border-glow`      |
| `--icon-btn-border` | `rgba(0, 0, 0, 0.08)`   | `rgba(255, 255, 255, 0.06)`  | `--color-border-icon-btn`  |

### 2.3 Accent Colors

| Token         | Light Value   | Dark Value   | Dim Variant (Light)          | Dim Variant (Dark)           | Alias                     |
| ------------- | ------------- | ------------ | ----------------------------- | ----------------------------- | ------------------------- |
| `--blue`      | `#2563eb`     | `#4d9fff`    | `--blue-dim: rgba(37,99,235,0.08)`   | `rgba(77,159,255,0.1)`   | `--color-accent-blue`     |
| `--cyan`      | `#0891b2`     | `#3dd6c8`    | `--cyan-dim: rgba(8,145,178,0.08)`   | `rgba(61,214,200,0.1)`   | `--color-accent-cyan`     |
| `--purple`    | `#7c3aed`     | `#a78bfa`    | `--purple-dim: rgba(124,58,237,0.08)`| `rgba(167,139,250,0.1)` | `--color-accent-purple`   |
| `--amber`     | `#d97706`     | `#f59e0b`    | `--amber-dim: rgba(217,119,6,0.08)`  | `rgba(245,158,11,0.1)`   | `--color-accent-amber`    |
| `--green`     | `#059669`     | `#34d399`    | `--green-dim: rgba(5,150,105,0.08)`  | `rgba(52,211,153,0.1)`   | `--color-accent-green`    |
| `--red`       | `#dc2626`     | `#f87171`    | `--red-dim: rgba(220,38,38,0.06)`    | `rgba(248,113,113,0.1)` | `--color-accent-red`      |

### 2.4 Text Tokens

| Token              | Light Value | Dark Value  | Alias                    |
| ------------------ | ----------- | ----------- | ------------------------ |
| `--text-primary`   | `#1c1917`   | `#e2e8f0`   | `--color-text-primary`   |
| `--text-secondary` | `#78716c`   | `#8899b4`   | `--color-text-secondary` |
| `--text-muted`     | `#a8a29e`   | `#4a5575`   | `--color-text-muted`     |

### 2.5 Department Colors

10 departments, each with a primary and accent color.

| Department        | Primary Token            | Primary Value | Accent Token                  | Accent Value |
| ----------------- | ------------------------ | ------------- | ----------------------------- | ------------ |
| Software          | `--dept-software`        | `#0a84ff`     | `--dept-software-accent`      | `#64d2ff`    |
| AI Movie          | `--dept-ai-movie`        | `#ff375f`     | `--dept-ai-movie-accent`      | `#ff6b8a`    |
| Data              | `--dept-data`            | `#bf5af2`     | `--dept-data-accent`          | `#d4a0ff`    |
| Content           | `--dept-content`         | `#ff9f0a`     | `--dept-content-accent`       | `#ffb340`    |
| PPT               | `--dept-ppt`             | `#30d158`     | `--dept-ppt-accent`           | `#5e9e6b`    |
| Marketing         | `--dept-marketing`       | `#34c759`     | `--dept-marketing-accent`     | `#5e9e6b`    |
| Sales             | `--dept-sales`           | `#ff9500`     | `--dept-sales-accent`         | `#ffb340`    |
| Design            | `--dept-design`          | `#af52de`     | `--dept-design-accent`        | `#d4a0ff`    |
| Product           | `--dept-product`         | `#5856d6`     | `--dept-product-accent`       | `#8b83ff`    |
| Finance           | `--dept-finance`         | `#63e6be`     | `--dept-finance-accent`       | `#a7f3d0`    |

### 2.6 Role Theme Colors

6 agent roles, each with a base color and a gradient pair (start/end).

| Role        | Base Token             | Base Value | Gradient Start Token                    | Gradient Start | Gradient End Token                      | Gradient End |
| ----------- | ---------------------- | ---------- | --------------------------------------- | -------------- | --------------------------------------- | ------------ |
| CEO         | `--role-ceo`           | `#e11d48`  | `--role-ceo-gradient-start`             | `#e11d48`      | `--role-ceo-gradient-end`               | `#f43f5e`    |
| Planner     | `--role-planner`       | `#8b5cf6`  | `--role-planner-gradient-start`         | `#8b5cf6`      | `--role-planner-gradient-end`           | `#a78bfa`    |
| Executor    | `--role-executor`      | `#f59e0b`  | `--role-executor-gradient-start`        | `#f59e0b`      | `--role-executor-gradient-end`         | `#fbbf24`    |
| Monitor     | `--role-monitor`       | `#10b981`  | `--role-monitor-gradient-start`         | `#10b981`      | `--role-monitor-gradient-end`           | `#34d399`    |
| Reviewer    | `--role-reviewer`      | `#3b82f6`  | `--role-reviewer-gradient-start`        | `#3b82f6`      | `--role-reviewer-gradient-end`          | `#60a5fa`    |
| Coordinator | `--role-coordinator`   | `#ec4899`  | `--role-coordinator-gradient-start`      | `#ec4899`      | `--role-coordinator-gradient-end`       | `#f472b6`    |

### 2.7 Status Colors

| Token               | Value    | Alias                       |
| ------------------- | -------- | --------------------------- |
| `--status-active`   | `#30d158`| `--color-status-active`     |
| `--status-completed`| `#bf5af2`| `--color-status-completed`  |
| `--status-planning` | `#0a84ff`| `--color-status-planning`   |

### 2.8 Typography

| Token          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| `--font-mono`  | `'JetBrains Mono', 'Cascadia Code', monospace`                    |
| `--font-sans`  | `'Noto Sans SC', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` |

### 2.9 Radius

| Token         | Value  |
| ------------- | ------ |
| `--radius-sm` | `6px` |

### 2.10 Motion

| Token         | Value                              |
| ------------- | ---------------------------------- |
| `--ease-out`  | `cubic-bezier(0.16, 1, 0.3, 1)`  |

### 2.11 Glassmorphism

| Token          | Light | Dark  |
| -------------- | ----- | ----- |
| `--glass-blur`  | `20px`| `16px`|

---

## 3. Component Inventory

### 3.1 button

Primary / secondary / ghost action buttons.

- **Variants**: `primary`, `secondary`, `ghost`
- **States**: `default`, `hover`
- **Anatomy**: `.btn-label`, `.btn-icon`
- **Structure**: `inline-flex`, `align-items: center`, `gap: 6px`, `padding: 6px 16px`, `borderRadius: var(--radius-sm)`, `fontSize: 0.8rem`, `fontWeight: 500`, `transition: all 0.15s ease`
- **Usage**: Primary for main CTA; secondary for supplementary actions; ghost for minimal/tertiary actions

### 3.2 card

Glassmorphism dashboard card with header / body / footer.

- **Variants**: `flat`, `elevated`
- **Anatomy**: `.card` (container), `.card-header`, `.card-body`, `.card-footer`
- **Structure**: `background: var(--bg-elevated)`, `border: 1px solid var(--border-card)`, `borderRadius: 12px`, `padding: 16px`; header and footer separated by `border-bottom` / `border-top`
- **Usage**: Agent status cards, task decomposition nodes, collaboration visualizer panels

### 3.3 input

Settings-style form inputs with mono font.

- **Variants**: `text`, `select`
- **Anatomy**: `.input-label`, `.input-field`
- **Structure**: label `fontSize: 0.75rem`, `color: var(--text-secondary)`; field `width: 100%`, `padding: 8px 10px`, `background: var(--bg-input)`, `border: 1px solid var(--border-card)`, `borderRadius: var(--radius-sm)`, `fontFamily: var(--font-mono)`, `fontSize: 0.8rem`; focus `borderColor: var(--blue)`
- **Usage**: Settings panel inputs, skill configuration fields

### 3.4 status-badge

Pill-shaped status indicators with dot animations.

- **Variants**: `active`, `completed`, `planning`, `error`
- **Anatomy**: `.status-badge` (container), `.status-label`
- **Structure**: `display: inline-flex`, `alignItems: center`, `gap: 6px`, `padding: 2px 8px`, `borderRadius: 12px`, `fontSize: 0.7rem`, `fontWeight: 500`; dot `width: 8px`, `height: 8px`, `borderRadius: 50%`
- **Usage**: Agent status indicators, task status labels, project status markers

### 3.5 agent-card

Role-themed agent cards with gradient accents and metrics.

- **Variants**: `ceo`, `planner`, `executor`, `monitor`, `reviewer`, `coordinator` (by role)
- **Anatomy**: `.agent-role-card`, `.role-avatar`, `.agent-identity`, `.agent-name`, `.agent-role-badge`, `.status-indicator`, `.card-body`, `.agent-metrics`, `.card-footer`
- **Structure**: 4px gradient top bar (`linear-gradient(90deg, start, end)`); role badge with gradient background; 3-column metrics grid; pulse-animated status dot
- **Usage**: Agent role cards in office-team view, agent status panel entries, role assignment interface

### 3.6 progress-bar

Multi-size progress bars with color variants.

- **Variants**: `sm` (4px track), `md` (8px track), `lg` (12px track)
- **Anatomy**: `.progress-bar-container`, `.progress-track`, `.progress-fill`, `.progress-label`, `.progress-percentage`
- **Structure**: flex container with gap 12px; track `flex: 1`, `borderRadius: 6px/4px/2px` by size; fill `height: 100%`, `borderRadius: inherit`, `transition: width 0.3s ease`, `background: var(--blue)`; percentage `fontSize: 1.2rem`, `fontWeight: 600`
- **Usage**: Task completion progress, agent workload bars, project iteration tracking

---

## 4. Usage Guidelines

### 4.1 Portable Aliases

Always prefer the `--color-*` portable alias layer over raw source token names. Aliases automatically inherit the correct light/dark values and insulate consumers from internal token renames.

```css
/* Preferred */
color: var(--color-text-primary);
background: var(--color-bg-elevated);
border: 1px solid var(--color-border-default);

/* Avoid */
color: var(--text-primary);
background: var(--bg-elevated);
border: 1px solid var(--border-card);
```

### 4.2 Dark Theme as Default

The 大荒界 (MDH) platform is dark-first. Design and implement for the dark theme as the primary experience. The light theme is provided as an alternative but should not be the starting point for new designs.

### 4.3 Glassmorphism

Use `backdrop-filter: blur(var(--glass-blur))` combined with semi-transparent backgrounds (`var(--bg-elevated)`, `var(--header-bg)`, etc.) to achieve the signature glass panel effect. The blur value differs between themes (20px light / 16px dark).

```css
.glass-panel {
  background: var(--bg-elevated);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
}
```

### 4.4 Role Colors

Each of the 6 agent roles has a unique `themeColor` and a gradient pair (`-gradient-start` / `-gradient-end`). Use the gradient pair for top bars, badges, and accent strips on agent cards. Use the base color for status dots, icons, and text highlights.

```css
.agent-card[data-role="planner"] {
  --gradient-start: var(--role-planner-gradient-start);
  --gradient-end: var(--role-planner-gradient-end);
  --theme-color: var(--role-planner);
}
```

### 4.5 Department Colors

10 departments each have a primary and accent color. Use the primary color for department labels, badges, and chart segments. Use the accent color for highlights, secondary indicators, and hover states.

```css
.dept-tag[data-dept="software"] {
  color: var(--dept-software);
  background: var(--dept-software-accent);
}
```
