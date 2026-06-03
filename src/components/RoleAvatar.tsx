import React from 'react'
import type { AgentRole } from '../modules/agentTypes'

interface RoleAvatarProps {
  role: AgentRole
  size?: number
  status?: 'idle' | 'busy' | 'waiting' | 'error' | 'offline'
  animate?: boolean
}

const avatarConfigs: Record<AgentRole, {
  primary: string
  glow: string
  accent: string
  skin: string
  hair: string
  emoji: string
}> = {
  ceo: { primary: '#ff2d55', glow: '#ff2d5540', accent: '#ffd60a', skin: '#ffdeb4', hair: '#1a1a2e', emoji: '👔' },
  planner: { primary: '#bf5af2', glow: '#bf5af240', accent: '#5e5ce6', skin: '#ffe0c0', hair: '#3a2a1a', emoji: '🧠' },
  executor: { primary: '#ff9f0a', glow: '#ff9f0a40', accent: '#30d158', skin: '#ffd5b4', hair: '#2d1f14', emoji: '⚡' },
  monitor: { primary: '#30d158', glow: '#30d15840', accent: '#64d2ff', skin: '#ffdeb4', hair: '#8b4513', emoji: '🛡' },
  reviewer: { primary: '#0a84ff', glow: '#0a84ff40', accent: '#5e5ce6', skin: '#ffe0c0', hair: '#1a1a2e', emoji: '🔍' },
  coordinator: { primary: '#ff375f', glow: '#ff375f40', accent: '#bf5af2', skin: '#ffd5b4', hair: '#d2691e', emoji: '🎯' },
}

/* ───────── CTO · 技术总监 ───────── */
const CEOAvatar: React.FC<{ c: typeof avatarConfigs.ceo; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 功率光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="2" opacity="0.3" strokeDasharray="4 4">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="12s" repeatCount="indefinite" />
    </circle>
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - 西装 */}
    <path d="M38 68C38 68 34 72 34 80V95C34 100 42 108 60 108C78 108 86 100 86 95V80C86 72 82 68 82 68H72L66 74H54L48 68H38Z" fill="#1a1a2e" />
    <path d="M48 68L54 74H66L72 68" stroke={c.primary} strokeWidth="2" />
    {/* 领带 */}
    <rect x="57" y="72" width="6" height="18" rx="1" fill={c.primary} />
    <path d="M56 72L60 76L64 72" fill={c.accent} />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 大背头 */}
    <path d="M36 40C36 40 38 18 60 18C82 18 84 40 84 40C84 32 78 24 70 22C62 20 58 22 50 24C42 26 36 34 36 40Z" fill={c.hair} />
    <path d="M36 40C36 36 40 28 50 26" stroke="#0a0a1a" strokeWidth="2" opacity="0.3" />
    {/* 眼睛 - 锐利 */}
    <path d="M44 42L54 44L44 46Z" fill={c.hair} />
    <path d="M76 42L66 44L76 46Z" fill={c.hair} />
    <circle cx="49" cy="44" r="4" fill="white" />
    <circle cx="71" cy="44" r="4" fill="white" />
    <circle cx="50" cy="44" r="2.5" fill={c.hair} />
    <circle cx="72" cy="44" r="2.5" fill={c.hair} />
    <circle cx="51" cy="43" r="1" fill="white" />
    <circle cx="73" cy="43" r="1" fill="white" />
    {/* 嘴 - 自信微笑 */}
    <path d="M50 55C50 55 55 60 60 60C65 60 70 55 70 55" stroke={c.hair} strokeWidth="2" strokeLinecap="round" fill="none" />
    {/* 皇冠 */}
    <path d="M40 22L44 10L52 18L60 6L68 18L76 10L80 22" fill={c.accent} />
    <rect x="40" y="20" width="40" height="4" rx="1" fill={c.accent} />
    {/* 闪光 */}
    <circle cx="90" cy="20" r="3" fill={c.accent} opacity="0.6">
      <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="28" cy="30" r="2" fill={c.primary} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
    </circle>
  </svg>
)

/* ───────── 架构师 · Alpha ───────── */
const PlannerAvatar: React.FC<{ c: typeof avatarConfigs.planner; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 脑波光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="1.5" opacity="0.2" strokeDasharray="2 6">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="-360 60 60" dur="20s" repeatCount="indefinite" />
    </circle>
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - 连帽衫 */}
    <path d="M38 68C38 68 34 72 34 80V95C34 100 42 108 60 108C78 108 86 100 86 95V80C86 72 82 68 82 68H72L66 74H54L48 68H38Z" fill={c.primary} />
    {/* 帽子 */}
    <path d="M42 68C42 68 46 62 60 62C74 62 78 68 78 68" fill={c.accent} opacity="0.6" />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 蓬松 */}
    <path d="M36 42C36 42 38 16 60 16C82 16 84 42 84 42" fill={c.hair} />
    <circle cx="40" cy="32" r="8" fill={c.hair} />
    <circle cx="52" cy="22" r="9" fill={c.hair} />
    <circle cx="64" cy="20" r="10" fill={c.hair} />
    <circle cx="76" cy="26" r="8" fill={c.hair} />
    <circle cx="82" cy="36" r="6" fill={c.hair} />
    {/* 眼镜 - 圆框 */}
    <circle cx="48" cy="44" r="10" stroke={c.accent} strokeWidth="3" fill="none" />
    <circle cx="72" cy="44" r="10" stroke={c.accent} strokeWidth="3" fill="none" />
    <path d="M58 44H62" stroke={c.accent} strokeWidth="2.5" />
    <path d="M38 42L34 40" stroke={c.accent} strokeWidth="2" />
    <path d="M82 42L86 40" stroke={c.accent} strokeWidth="2" />
    {/* 眼睛 */}
    <circle cx="48" cy="44" r="4" fill="white" />
    <circle cx="72" cy="44" r="4" fill="white" />
    <circle cx="49" cy="44" r="2.5" fill={c.hair} />
    <circle cx="73" cy="44" r="2.5" fill={c.hair} />
    <circle cx="50" cy="43" r="1" fill="white" />
    <circle cx="74" cy="43" r="1" fill="white" />
    {/* 嘴 - 思考 */}
    <path d="M54 56C54 56 57 54 60 54C63 54 66 56 66 56" stroke={c.hair} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    {/* 思考泡泡 */}
    <circle cx="92" cy="24" r="4" fill={c.primary} opacity="0.3">
      <animate attributeName="r" values="4;5;4" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="100" cy="14" r="6" fill={c.primary} opacity="0.2">
      <animate attributeName="r" values="6;7;6" dur="2.5s" repeatCount="indefinite" />
    </circle>
    <text x="104" y="12" fontSize="10" fill={c.primary} opacity="0.5">?</text>
    {/* 代码飘浮 */}
    <text x="20" y="20" fontSize="8" fill={c.accent} opacity="0.3" fontFamily="monospace">
      {'{ }'}
      <animate attributeName="y" values="20;14;20" dur="4s" repeatCount="indefinite" />
    </text>
  </svg>
)

/* ───────── 全栈开发 · Beta ───────── */
const ExecutorAvatar: React.FC<{ c: typeof avatarConfigs.executor; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 能量光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="2" opacity="0.2" strokeDasharray="8 4">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="8s" repeatCount="indefinite" />
    </circle>
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - 卫衣 */}
    <path d="M38 68C38 68 34 72 34 80V95C34 100 42 108 60 108C78 108 86 100 86 95V80C86 72 82 68 82 68H72L66 74H54L48 68H38Z" fill={c.primary} />
    {/* 口袋 */}
    <rect x="42" y="82" width="16" height="10" rx="2" fill={c.accent} opacity="0.3" />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 刺猬头 */}
    <path d="M38 42C38 42 40 20 60 20C80 20 82 42 82 42" fill={c.hair} />
    <path d="M42 22L38 8L48 18" fill={c.hair} />
    <path d="M52 20L50 4L58 16" fill={c.hair} />
    <path d="M62 20L64 2L68 16" fill={c.hair} />
    <path d="M72 22L76 6L74 18" fill={c.hair} />
    {/* 耳机 */}
    <path d="M34 38C34 38 32 28 36 22C40 16 50 14 60 14C70 14 80 16 84 22C88 28 86 38 86 38" stroke={c.accent} strokeWidth="4" fill="none" />
    <rect x="30" y="36" width="10" height="14" rx="4" fill={c.accent} />
    <rect x="80" y="36" width="10" height="14" rx="4" fill={c.accent} />
    {/* 眼睛 - 兴奋 */}
    <circle cx="48" cy="44" r="5" fill="white" />
    <circle cx="72" cy="44" r="5" fill="white" />
    <circle cx="49" cy="44" r="3" fill={c.hair} />
    <circle cx="73" cy="44" r="3" fill={c.hair} />
    <circle cx="50" cy="43" r="1.5" fill="white" />
    <circle cx="74" cy="43" r="1.5" fill="white" />
    {/* 嘴 - 大笑 */}
    <path d="M48 54C48 54 54 62 60 62C66 62 72 54 72 54" stroke={c.hair} strokeWidth="2" strokeLinecap="round" fill={c.primary} opacity="0.4" />
    {/* 闪电 */}
    <path d="M90 30L84 45H92L84 58" stroke={c.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
    </path>
    {/* 代码粒子 */}
    <text x="16" y="50" fontSize="9" fill={c.primary} opacity="0.4" fontFamily="monospace">fn()</text>
    <text x="88" y="70" fontSize="8" fill={c.accent} opacity="0.3" fontFamily="monospace">{'<>'}</text>
  </svg>
)

/* ───────── DevOps · Gamma ───────── */
const MonitorAvatar: React.FC<{ c: typeof avatarConfigs.monitor; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 矩阵光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="1" opacity="0.15" strokeDasharray="2 2" />
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - 实验服 */}
    <path d="M38 68C38 68 32 72 32 80V98C32 102 44 108 60 108C76 108 88 102 88 98V80C88 72 82 68 82 68H72L66 74H54L48 68H38Z" fill="#e8e8e8" />
    <path d="M54 68V90" stroke={c.primary} strokeWidth="1" opacity="0.3" />
    <path d="M66 68V90" stroke={c.primary} strokeWidth="1" opacity="0.3" />
    {/* 口袋 */}
    <rect x="68" y="78" width="12" height="8" rx="1" stroke={c.primary} strokeWidth="1" fill="none" opacity="0.5" />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 干练短发 */}
    <path d="M36 42C36 42 40 18 60 18C80 18 84 42 84 42C84 34 78 26 70 24C62 22 58 24 50 26C42 28 36 36 36 42Z" fill={c.hair} />
    {/* 终端眼镜 */}
    <rect x="36" y="38" width="20" height="14" rx="3" fill="#1a1a2e" stroke={c.accent} strokeWidth="2" />
    <rect x="64" y="38" width="20" height="14" rx="3" fill="#1a1a2e" stroke={c.accent} strokeWidth="2" />
    <path d="M56 44H64" stroke={c.accent} strokeWidth="2" />
    {/* 镜片上的代码 */}
    <text x="40" y="48" fontSize="6" fill={c.primary} fontFamily="monospace" opacity="0.8">$ _</text>
    <text x="68" y="48" fontSize="6" fill={c.primary} fontFamily="monospace" opacity="0.8">ok</text>
    {/* 嘴 - 冷静 */}
    <path d="M52 58H68" stroke={c.hair} strokeWidth="2" strokeLinecap="round" />
    {/* 盾牌 */}
    <path d="M92 40L92 55C92 65 80 72 80 72C80 72 92 65 92 55" fill={c.primary} opacity="0.3" />
    <path d="M88 44L92 40L96 44V54C96 60 92 64 92 64C92 64 88 60 88 54V44Z" fill={c.primary} opacity="0.6" />
    {/* 终端光标 */}
    <rect x="18" y="28" width="6" height="2" fill={c.primary} opacity="0.5">
      <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
    </rect>
  </svg>
)

/* ───────── QA工程师 · Delta ───────── */
const ReviewerAvatar: React.FC<{ c: typeof avatarConfigs.reviewer; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 扫描光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="2" opacity="0.2" strokeDasharray="6 3">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="-360 60 60" dur="15s" repeatCount="indefinite" />
    </circle>
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - Polo衫 */}
    <path d="M38 68C38 68 34 72 34 80V95C34 100 42 108 60 108C78 108 86 100 86 95V80C86 72 82 68 82 68H72L66 74H54L48 68H38Z" fill={c.primary} />
    {/* 翻领 */}
    <path d="M48 68L54 76H66L72 68" fill="white" opacity="0.2" />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 整齐侧分 */}
    <path d="M36 40C36 40 40 16 60 16C80 16 84 40 84 40C84 32 78 24 68 22C58 20 52 22 44 26C38 30 36 38 36 40Z" fill={c.hair} />
    <path d="M44 24C48 20 56 18 60 18" stroke="#0a0a1a" strokeWidth="1" opacity="0.2" />
    {/* 放大镜 */}
    <circle cx="90" cy="36" r="14" stroke={c.accent} strokeWidth="4" fill="none" opacity="0.7" />
    <path d="M100 48L112 60" stroke={c.accent} strokeWidth="5" strokeLinecap="round" opacity="0.7" />
    {/* 放大镜内的bug */}
    <text x="84" y="40" fontSize="12" fill={c.accent} opacity="0.5">🐛</text>
    {/* 眼睛 - 审视 */}
    <path d="M42 42L56 44L42 46Z" fill={c.hair} />
    <path d="M78 42L64 44L78 46Z" fill={c.hair} />
    <circle cx="49" cy="44" r="4.5" fill="white" />
    <circle cx="71" cy="44" r="4.5" fill="white" />
    <circle cx="50" cy="44" r="3" fill={c.hair} />
    <circle cx="72" cy="44" r="3" fill={c.hair} />
    <circle cx="51" cy="43" r="1.2" fill="white" />
    <circle cx="73" cy="43" r="1.2" fill="white" />
    {/* 嘴 - 专注 */}
    <path d="M52 56H68" stroke={c.hair} strokeWidth="2" strokeLinecap="round" />
    {/* 检查清单 */}
    <rect x="14" y="50" width="18" height="22" rx="2" fill="white" opacity="0.9" />
    <path d="M18 55L21 58L26 52" stroke={c.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 62L21 65L26 59" stroke={c.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 69L21 72" stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
    {/* 扫描线 */}
    <line x1="36" y1="44" x2="42" y2="44" stroke={c.primary} strokeWidth="1" opacity="0.4">
      <animate attributeName="x1" values="36;38;36" dur="2s" repeatCount="indefinite" />
    </line>
  </svg>
)

/* ───────── 项目经理 · Epsilon ───────── */
const CoordinatorAvatar: React.FC<{ c: typeof avatarConfigs.coordinator; s: number }> = ({ c, s }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none">
    {/* 连接光环 */}
    <circle cx="60" cy="60" r="56" stroke={c.primary} strokeWidth="1.5" opacity="0.2" strokeDasharray="4 8">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="18s" repeatCount="indefinite" />
    </circle>
    <circle cx="60" cy="60" r="50" fill={c.glow} />
    {/* 身体 - 休闲西装 */}
    <path d="M38 68C38 68 34 72 34 80V95C34 100 42 108 60 108C78 108 86 100 86 95V80C86 72 82 68 82 68H72L66 74H54L48 68H38Z" fill={c.primary} />
    {/* 围巾 */}
    <path d="M46 68C46 68 50 76 54 80C58 84 62 80 62 76C62 72 58 68 58 68" stroke={c.accent} strokeWidth="6" strokeLinecap="round" fill="none" />
    {/* 头部 */}
    <circle cx="60" cy="45" r="24" fill={c.skin} />
    {/* 发型 - 卷发 */}
    <path d="M36 42C36 42 38 16 60 16C82 16 84 42 84 42" fill={c.hair} />
    <circle cx="40" cy="30" r="7" fill={c.hair} />
    <circle cx="52" cy="20" r="8" fill={c.hair} />
    <circle cx="64" cy="18" r="9" fill={c.hair} />
    <circle cx="76" cy="24" r="7" fill={c.hair} />
    <circle cx="82" cy="34" r="5" fill={c.hair} />
    {/* 眼睛 - 温暖 */}
    <path d="M42 42C42 42 46 40 54 44" stroke={c.hair} strokeWidth="2" strokeLinecap="round" />
    <path d="M78 42C78 42 74 40 66 44" stroke={c.hair} strokeWidth="2" strokeLinecap="round" />
    <circle cx="49" cy="44" r="4" fill="white" />
    <circle cx="71" cy="44" r="4" fill="white" />
    <circle cx="50" cy="44" r="2.5" fill={c.hair} />
    <circle cx="72" cy="44" r="2.5" fill={c.hair} />
    <circle cx="51" cy="43" r="1" fill="white" />
    <circle cx="73" cy="43" r="1" fill="white" />
    {/* 嘴 - 微笑 */}
    <path d="M48 54C48 54 54 60 60 60C66 60 72 54 72 54" stroke={c.hair} strokeWidth="2" strokeLinecap="round" fill="none" />
    {/* 指挥棒 */}
    <path d="M92 38L110 18" stroke={c.accent} strokeWidth="3" strokeLinecap="round" />
    <circle cx="110" cy="18" r="4" fill={c.accent}>
      <animate attributeName="r" values="4;5;4" dur="1.5s" repeatCount="indefinite" />
    </circle>
    {/* 连接节点 */}
    <circle cx="18" cy="50" r="4" fill={c.primary} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
    </circle>
    <circle cx="18" cy="70" r="4" fill={c.accent} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" begin="1s" repeatCount="indefinite" />
    </circle>
    <circle cx="18" cy="90" r="4" fill={c.primary} opacity="0.4">
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" begin="2s" repeatCount="indefinite" />
    </circle>
    <path d="M22 50L34 58" stroke={c.primary} strokeWidth="1" opacity="0.3" />
    <path d="M22 70L34 66" stroke={c.accent} strokeWidth="1" opacity="0.3" />
    <path d="M22 90L34 82" stroke={c.primary} strokeWidth="1" opacity="0.3" />
  </svg>
)

export default function RoleAvatar({ role, size = 80, status = 'idle', animate = true }: RoleAvatarProps) {
  const c = avatarConfigs[role]
  const isOffline = status === 'offline'
  const isError = status === 'error'

  const statusColors: Record<string, string> = {
    idle: '#30d158',
    busy: '#ff9f0a',
    waiting: '#0a84ff',
    error: '#ff453a',
    offline: '#636366',
  }

  const renderAvatar = () => {
    switch (role) {
      case 'ceo': return <CEOAvatar c={c} s={size} />
      case 'planner': return <PlannerAvatar c={c} s={size} />
      case 'executor': return <ExecutorAvatar c={c} s={size} />
      case 'monitor': return <MonitorAvatar c={c} s={size} />
      case 'reviewer': return <ReviewerAvatar c={c} s={size} />
      case 'coordinator': return <CoordinatorAvatar c={c} s={size} />
      default: return <PlannerAvatar c={c} s={size} />
    }
  }

  return (
    <div style={{ width: size, height: size, position: 'relative', opacity: isOffline ? 0.4 : 1, filter: isOffline ? 'grayscale(60%)' : 'none', transition: 'all 0.3s ease' }}>
      {renderAvatar()}

      {/* 状态光环 */}
      <div style={{
        position: 'absolute', inset: -3, borderRadius: '50%',
        border: `2.5px solid ${statusColors[status]}`,
        opacity: isOffline ? 0.2 : 0.8,
        boxShadow: animate && status !== 'idle' && status !== 'offline' ? `0 0 12px ${statusColors[status]}60` : 'none',
        animation: status === 'busy' && animate ? 'avatar-ring-spin 3s linear infinite' : 'none',
      }} />

      {/* 状态指示灯 */}
      <div style={{
        position: 'absolute', bottom: 1, right: 1,
        width: Math.max(size * 0.22, 10), height: Math.max(size * 0.22, 10),
        borderRadius: '50%',
        background: statusColors[status],
        border: '2px solid #0a0a1a',
        boxShadow: `0 0 8px ${statusColors[status]}`,
        animation: animate && status !== 'offline' ? 'avatar-pulse 2s ease-in-out infinite' : 'none',
      }} />

      {/* 错误标识 */}
      {isError && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: size * 0.28, height: size * 0.28,
          borderRadius: '50%', background: '#ff453a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.14, color: 'white', fontWeight: 800,
          border: '2px solid #0a0a1a', fontFamily: 'monospace',
        }}>!</div>
      )}

      {/* 忙碌动画 - 旋转齿轮 */}
      {status === 'busy' && animate && (
        <div style={{
          position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
          fontSize: size * 0.2, lineHeight: 1,
          animation: 'avatar-ring-spin 2s linear infinite',
        }}>⚙</div>
      )}

      <style>{`
        @keyframes avatar-ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes avatar-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.7; } }
      `}</style>
    </div>
  )
}
