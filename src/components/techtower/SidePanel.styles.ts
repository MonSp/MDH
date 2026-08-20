/**
 * SidePanel 及子组件共享样式常量
 */

import type { CSSProperties } from 'react'

export const inputStyle: CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(100,210,255,0.2)',
  color: '#e0e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box',
}

export const selectStyle: CSSProperties = {
  ...inputStyle, appearance: 'none' as const,
}

export const tagStyle = (active: boolean, color: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
  background: active ? `${color}25` : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? color + '50' : 'rgba(255,255,255,0.08)'}`,
  color: active ? color : '#667', transition: 'all 0.15s',
})

export const cardStyle: CSSProperties = {
  padding: '10px 12px', marginBottom: 6, borderRadius: 8,
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,210,255,0.1)',
}

export const headerStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(100,210,255,0.1)',
}

export const closeBtn: CSSProperties = {
  background: 'none', border: 'none', color: '#667', fontSize: 20, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
}

export const btn = (color: string): CSSProperties => ({
  width: '100%', padding: '10px 0', borderRadius: 8,
  background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
  border: `1px solid ${color}60`, color: '#fff', fontWeight: 700,
  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12,
})

export const badge = (text: string, color: string): CSSProperties => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color, background: `${color}20`,
  border: `1px solid ${color}40`,
})

export const memberRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: 'rgba(255,255,255,0.03)', fontSize: 13,
}

export const avatarCircle: CSSProperties = {
  width: 44, height: 44, borderRadius: '50%',
  background: 'linear-gradient(135deg, rgba(100,210,255,0.2), rgba(191,90,242,0.2))',
  border: '1px solid rgba(100,210,255,0.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, color: '#e0e8f0', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
}

export const scrollRow: CSSProperties = {
  display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
  scrollbarWidth: 'thin', scrollbarColor: 'rgba(100,210,255,0.2) transparent',
}
