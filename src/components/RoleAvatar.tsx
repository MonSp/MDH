import React from 'react'
import type { AgentRole } from '../modules/agentTypes'

interface RoleAvatarProps {
  role: AgentRole
  size?: number
  status?: 'idle' | 'busy' | 'waiting' | 'error' | 'offline'
  animate?: boolean
}

const avatarConfigs: Record<AgentRole, {
  primaryColor: string
  secondaryColor: string
  accessoryColor: string
  skinColor: string
  hairColor: string
}> = {
  ceo: {
    primaryColor: '#e11d48',
    secondaryColor: '#f43f5e',
    accessoryColor: '#fbbf24',
    skinColor: '#ffd5b4',
    hairColor: '#1a1a2e',
  },
  planner: {
    primaryColor: '#8b5cf6',
    secondaryColor: '#a78bfa',
    accessoryColor: '#fbbf24',
    skinColor: '#ffd5b4',
    hairColor: '#4a3728',
  },
  executor: {
    primaryColor: '#f59e0b',
    secondaryColor: '#fbbf24',
    accessoryColor: '#3b82f6',
    skinColor: '#ffe0c0',
    hairColor: '#2d1f14',
  },
  monitor: {
    primaryColor: '#10b981',
    secondaryColor: '#34d399',
    accessoryColor: '#f472b6',
    skinColor: '#ffd5b4',
    hairColor: '#8b4513',
  },
  reviewer: {
    primaryColor: '#3b82f6',
    secondaryColor: '#60a5fa',
    accessoryColor: '#f59e0b',
    skinColor: '#ffe0c0',
    hairColor: '#1a1a2e',
  },
  coordinator: {
    primaryColor: '#ec4899',
    secondaryColor: '#f472b6',
    accessoryColor: '#8b5cf6',
    skinColor: '#ffd5b4',
    hairColor: '#d2691e',
  },
}

const CEOAvatar: React.FC<{ config: typeof avatarConfigs.ceo, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    <path d="M60 110C60 110 30 95 30 70V60C30 55 35 50 40 50H80C85 50 90 55 90 60V70C90 95 60 110 60 110Z"
          fill={config.primaryColor} />
    <path d="M50 55L60 65L70 55" stroke={config.accessoryColor} strokeWidth="3" strokeLinecap="round" />
    <circle cx="60" cy="38" r="22" fill={config.skinColor} />
    <path d="M38 32C38 32 42 15 60 15C78 15 82 32 82 32C82 32 78 25 72 22C66 19 60 20 60 20C60 20 54 19 48 22C42 25 38 32 38 32Z"
          fill={config.hairColor} />
    <circle cx="50" cy="38" r="4" fill="#1a1a2e" />
    <circle cx="70" cy="38" r="4" fill="#1a1a2e" />
    <circle cx="51" cy="37" r="1.5" fill="white" />
    <circle cx="71" cy="37" r="1.5" fill="white" />
    <path d="M52 48C52 48 56 52 60 52C64 52 68 48 68 48" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M40 20L60 8L80 20" fill={config.accessoryColor} />
    <rect x="55" y="8" width="10" height="4" rx="2" fill={config.accessoryColor} />
    <circle cx="60" cy="6" r="3" fill={config.accessoryColor} />
  </svg>
)

const PlannerAvatar: React.FC<{ config: typeof avatarConfigs.planner, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    {/* 背景 */}
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    
    {/* 身体 */}
    <path d="M60 110C60 110 30 95 30 70V60C30 55 35 50 40 50H80C85 50 90 55 90 60V70C90 95 60 110 60 110Z" 
          fill={config.primaryColor} />
    
    {/* 衣领 */}
    <path d="M50 55L60 65L70 55" stroke={config.secondaryColor} strokeWidth="3" strokeLinecap="round" />
    
    {/* 头部 */}
    <circle cx="60" cy="38" r="22" fill={config.skinColor} />
    
    {/* 头发 - 学者风格 */}
    <path d="M38 32C38 32 42 15 60 15C78 15 82 32 82 32C82 32 80 25 75 22C70 19 65 20 60 20C55 20 50 19 45 22C40 25 38 32 38 32Z" 
          fill={config.hairColor} />
    
    {/* 眼镜 */}
    <circle cx="50" cy="38" r="8" stroke={config.accessoryColor} strokeWidth="2.5" fill="none" />
    <circle cx="70" cy="38" r="8" stroke={config.accessoryColor} strokeWidth="2.5" fill="none" />
    <path d="M58 38H62" stroke={config.accessoryColor} strokeWidth="2" />
    
    {/* 眼睛 */}
    <circle cx="50" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="70" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="51" cy="37" r="1" fill="white" />
    <circle cx="71" cy="37" r="1" fill="white" />
    
    {/* 嘴巴 - 微笑 */}
    <path d="M52 48C52 48 56 52 60 52C64 52 68 48 68 48" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" fill="none" />
    
    {/* 帽子 - 思考帽 */}
    <ellipse cx="60" cy="18" rx="25" ry="5" fill={config.accessoryColor} />
    <rect x="48" y="8" width="24" height="12" rx="2" fill={config.accessoryColor} />
    
    {/* 思考泡泡 */}
    <circle cx="90" cy="20" r="4" fill={config.secondaryColor} opacity="0.6" />
    <circle cx="98" cy="12" r="6" fill={config.secondaryColor} opacity="0.4" />
    <circle cx="108" cy="6" r="8" fill={config.secondaryColor} opacity="0.3" />
  </svg>
)

const ExecutorAvatar: React.FC<{ config: typeof avatarConfigs.executor, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    {/* 背景 */}
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    
    {/* 身体 - 工装 */}
    <path d="M60 110C60 110 30 95 30 70V60C30 55 35 50 40 50H80C85 50 90 55 90 60V70C90 95 60 110 60 110Z" 
          fill={config.primaryColor} />
    
    {/* 工具带 */}
    <rect x="35" y="70" width="50" height="6" rx="3" fill={config.accessoryColor} />
    <circle cx="45" cy="73" r="3" fill="#ffd700" />
    <circle cx="55" cy="73" r="3" fill="#ffd700" />
    <circle cx="65" cy="73" r="3" fill="#ffd700" />
    
    {/* 头部 */}
    <circle cx="60" cy="38" r="22" fill={config.skinColor} />
    
    {/* 头发 - 短发 */}
    <path d="M38 35C38 35 40 18 60 18C80 18 82 35 82 35C82 35 78 28 72 25C66 22 60 22 60 22C60 22 54 22 48 25C42 28 38 35 38 35Z" 
          fill={config.hairColor} />
    
    {/* 安全帽 */}
    <path d="M35 30C35 30 38 12 60 12C82 12 85 30 85 30L80 35H40L35 30Z" 
          fill={config.accessoryColor} />
    <rect x="35" y="28" width="50" height="5" rx="2" fill={config.accessoryColor} />
    
    {/* 眼睛 - 坚定 */}
    <path d="M45 36H55" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" />
    <path d="M65 36H75" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" />
    <circle cx="50" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="70" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="51" cy="37" r="1" fill="white" />
    <circle cx="71" cy="37" r="1" fill="white" />
    
    {/* 嘴巴 - 自信微笑 */}
    <path d="M50 48C50 48 55 53 60 53C65 53 70 48 70 48" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    
    {/* 手臂 - 拿工具 */}
    <path d="M25 65C25 65 20 70 22 80L28 78" stroke={config.skinColor} strokeWidth="8" strokeLinecap="round" />
    <path d="M95 65C95 65 100 70 98 80L92 78" stroke={config.skinColor} strokeWidth="8" strokeLinecap="round" />
    
    {/* 闪电符号 */}
    <path d="M92 55L88 65H94L88 75" stroke="#ffd700" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MonitorAvatar: React.FC<{ config: typeof avatarConfigs.monitor, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    {/* 背景 */}
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    
    {/* 身体 - 斗篷 */}
    <path d="M60 110C60 110 25 90 25 65V55C25 50 30 45 35 45H85C90 45 95 50 95 55V65C95 90 60 110 60 110Z" 
          fill={config.primaryColor} />
    <path d="M35 45L60 55L85 45" stroke={config.secondaryColor} strokeWidth="2" />
    
    {/* 头部 */}
    <circle cx="60" cy="35" r="22" fill={config.skinColor} />
    
    {/* 头发 - 长发 */}
    <path d="M38 30C38 30 40 10 60 10C80 10 82 30 82 30V45C82 45 78 55 70 55H50C42 55 38 45 38 45V30Z" 
          fill={config.hairColor} />
    
    {/* 眼睛 - 敏锐 */}
    <path d="M45 32L55 35L45 38" fill="#1a1a2e" />
    <path d="M75 32L65 35L75 38" fill="#1a1a2e" />
    <circle cx="50" cy="35" r="4" fill="#1a1a2e" />
    <circle cx="70" cy="35" r="4" fill="#1a1a2e" />
    <circle cx="51" cy="34" r="2" fill="white" />
    <circle cx="71" cy="34" r="2" fill="white" />
    
    {/* 嘴巴 - 警觉 */}
    <path d="M52 48H68" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    
    {/* 监视器符号 */}
    <rect x="42" y="55" width="36" height="24" rx="4" fill={config.accessoryColor} opacity="0.8" />
    <rect x="46" y="59" width="28" height="16" rx="2" fill="#1a1a2e" />
    <circle cx="60" cy="67" r="5" fill={config.primaryColor} />
    <circle cx="60" cy="67" r="2" fill="white" />
    
    {/* 扫描线 */}
    <path d="M46 62H74" stroke={config.secondaryColor} strokeWidth="1" opacity="0.6">
      <animate attributeName="y1" values="59;75;59" dur="2s" repeatCount="indefinite" />
      <animate attributeName="y2" values="59;75;59" dur="2s" repeatCount="indefinite" />
    </path>
  </svg>
)

const ReviewerAvatar: React.FC<{ config: typeof avatarConfigs.reviewer, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    {/* 背景 */}
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    
    {/* 身体 - 西装 */}
    <path d="M60 110C60 110 30 95 30 70V60C30 55 35 50 40 50H80C85 50 90 55 90 60V70C90 95 60 110 60 110Z" 
          fill={config.primaryColor} />
    
    {/* 领带 */}
    <path d="M56 55L60 75L64 55" fill={config.accessoryColor} />
    <rect x="55" y="50" width="10" height="6" fill={config.accessoryColor} />
    
    {/* 头部 */}
    <circle cx="60" cy="38" r="22" fill={config.skinColor} />
    
    {/* 头发 - 整齐 */}
    <path d="M38 32C38 32 42 15 60 15C78 15 82 32 82 32C82 32 78 25 72 22C66 19 60 20 60 20C60 20 54 19 48 22C42 25 38 32 38 32Z" 
          fill={config.hairColor} />
    
    {/* 放大镜 */}
    <circle cx="85" cy="35" r="12" stroke={config.accessoryColor} strokeWidth="3" fill="none" />
    <path d="M94 44L105 55" stroke={config.accessoryColor} strokeWidth="4" strokeLinecap="round" />
    
    {/* 眼睛 - 审视 */}
    <circle cx="50" cy="38" r="5" fill="white" />
    <circle cx="70" cy="38" r="5" fill="white" />
    <circle cx="52" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="72" cy="38" r="3" fill="#1a1a2e" />
    <circle cx="53" cy="37" r="1.5" fill="white" />
    <circle cx="73" cy="37" r="1.5" fill="white" />
    
    {/* 眉毛 - 专注 */}
    <path d="M44 30C44 30 47 28 55 30" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    <path d="M76 30C76 30 73 28 65 30" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    
    {/* 嘴巴 - 严肃 */}
    <path d="M52 50H68" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    
    {/* 检查清单 */}
    <rect x="15" y="50" width="18" height="24" rx="2" fill="white" stroke={config.accessoryColor} strokeWidth="1.5" />
    <path d="M19 56L22 59L27 53" stroke={config.primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 64L22 67L27 61" stroke={config.primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 72L22 75L27 69" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CoordinatorAvatar: React.FC<{ config: typeof avatarConfigs.coordinator, size: number }> = ({ config, size }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    {/* 背景 */}
    <circle cx="60" cy="60" r="58" fill={config.primaryColor} opacity="0.15" />
    
    {/* 身体 - 优雅外套 */}
    <path d="M60 110C60 110 30 95 30 70V60C30 55 35 50 40 50H80C85 50 90 55 90 60V70C90 95 60 110 60 110Z" 
          fill={config.primaryColor} />
    
    {/* 围巾 */}
    <path d="M45 50C45 50 50 60 55 65C60 70 65 65 65 60C65 55 60 50 60 50" 
          stroke={config.secondaryColor} strokeWidth="6" strokeLinecap="round" fill="none" />
    
    {/* 头部 */}
    <circle cx="60" cy="38" r="22" fill={config.skinColor} />
    
    {/* 头发 - 卷发 */}
    <path d="M38 35C38 35 40 15 60 15C80 15 82 35 82 35" fill={config.hairColor} />
    <circle cx="42" cy="28" r="6" fill={config.hairColor} />
    <circle cx="52" cy="20" r="7" fill={config.hairColor} />
    <circle cx="62" cy="18" r="7" fill={config.hairColor} />
    <circle cx="72" cy="22" r="6" fill={config.hairColor} />
    <circle cx="78" cy="30" r="5" fill={config.hairColor} />
    
    {/* 眼睛 - 温暖 */}
    <path d="M44 35C44 35 47 32 55 35" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    <path d="M76 35C76 35 73 32 65 35" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
    <circle cx="50" cy="38" r="4" fill="#1a1a2e" />
    <circle cx="70" cy="38" r="4" fill="#1a1a2e" />
    <circle cx="51" cy="37" r="2" fill="white" />
    <circle cx="71" cy="37" r="2" fill="white" />
    
    {/* 嘴巴 - 微笑 */}
    <path d="M48 48C48 48 54 55 60 55C66 55 72 48 72 48" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" fill="none" />
    
    {/* 指挥棒 */}
    <path d="M90 40L110 20" stroke={config.accessoryColor} strokeWidth="3" strokeLinecap="round" />
    <circle cx="110" cy="20" r="4" fill={config.accessoryColor} />
    
    {/* 连接线 */}
    <circle cx="20" cy="50" r="5" fill={config.secondaryColor} opacity="0.5" />
    <circle cx="20" cy="70" r="5" fill={config.secondaryColor} opacity="0.5" />
    <circle cx="20" cy="90" r="5" fill={config.secondaryColor} opacity="0.5" />
    <path d="M25 50H35" stroke={config.secondaryColor} strokeWidth="1.5" opacity="0.5" />
    <path d="M25 70H35" stroke={config.secondaryColor} strokeWidth="1.5" opacity="0.5" />
    <path d="M25 90H35" stroke={config.secondaryColor} strokeWidth="1.5" opacity="0.5" />
  </svg>
)

export default function RoleAvatar({ role, size = 80, status = 'idle', animate = true }: RoleAvatarProps) {
  const config = avatarConfigs[role]
  const isOffline = status === 'offline'
  const isError = status === 'error'

  const statusColors: Record<string, string> = {
    idle: '#10b981',
    busy: '#f59e0b',
    waiting: '#3b82f6',
    error: '#ef4444',
    offline: '#6b7280',
  }

  const renderAvatar = () => {
    switch (role) {
      case 'ceo':
        return <CEOAvatar config={config} size={size} />
      case 'planner':
        return <PlannerAvatar config={config} size={size} />
      case 'executor':
        return <ExecutorAvatar config={config} size={size} />
      case 'monitor':
        return <MonitorAvatar config={config} size={size} />
      case 'reviewer':
        return <ReviewerAvatar config={config} size={size} />
      case 'coordinator':
        return <CoordinatorAvatar config={config} size={size} />
      default:
        return <PlannerAvatar config={config} size={size} />
    }
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        opacity: isOffline ? 0.5 : 1,
        filter: isOffline ? 'grayscale(50%)' : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      {renderAvatar()}
      
      {/* 状态环 */}
      <div
        style={{
          position: 'absolute',
          inset: -4,
          borderRadius: '50%',
          border: `3px solid ${statusColors[status]}`,
          opacity: isOffline ? 0.3 : 1,
          animation: status === 'busy' && animate ? 'rotate 3s linear infinite' : 'none',
        }}
      />
      
      {/* 状态点 */}
      <div
        style={{
          position: 'absolute',
          bottom: 2,
          right: 2,
          width: size * 0.2,
          height: size * 0.2,
          borderRadius: '50%',
          background: statusColors[status],
          border: '3px solid white',
          boxShadow: `0 0 8px ${statusColors[status]}`,
          animation: status !== 'offline' && animate ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
      
      {/* 错误标识 */}
      {isError && (
        <div
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: '50%',
            background: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.15,
            color: 'white',
            fontWeight: 'bold',
            border: '2px solid white',
          }}
        >
          !
        </div>
      )}
      
      <style>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}