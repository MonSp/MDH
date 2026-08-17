import React, { useState, useEffect, useCallback } from 'react'

interface MCPServer {
  name: string
  transport: string
  command: string
  args: string[]
  url: string
  env: Record<string, string>
  enabled: boolean
  status: string
  tools_count: number
  last_connected: string
  error_message: string
}

export default function McpConfigPanel() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // 表单状态
  const [form, setForm] = useState({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    env: '',
  })

  const fetchServers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mcp/servers')
      const data = await res.json()
      setServers(data.servers || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchServers() }, [fetchServers])

  const resetForm = () => {
    setForm({ name: '', transport: 'stdio', command: '', args: '', url: '', env: '' })
    setEditing(null)
    setShowAdd(false)
  }

  const handleAdd = async () => {
    if (!form.name) { setMessage('请输入服务器名称'); return }
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        transport: form.transport,
        enabled: true,
      }
      if (form.transport === 'stdio') {
        body.command = form.command
        body.args = form.args.split(/\s+/).filter(Boolean)
      } else {
        body.url = form.url
      }
      if (form.env) {
        try { body.env = JSON.parse(form.env) } catch { body.env = {} }
      }

      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`已添加: ${form.name}`)
        resetForm()
        fetchServers()
      } else {
        setMessage(`添加失败: ${data.error}`)
      }
    } catch { setMessage('添加失败') }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除 ${name}？`)) return
    try {
      const res = await fetch(`/api/mcp/servers/${name}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setMessage(`已删除: ${name}`)
        fetchServers()
      }
    } catch { setMessage('删除失败') }
  }

  const handleTest = async (name: string) => {
    setMessage(`测试连接: ${name}...`)
    try {
      const res = await fetch(`/api/mcp/servers/${name}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage(`连接成功: ${name} (${data.tools_count} 个工具)`)
      } else {
        setMessage(`连接失败: ${data.error}`)
      }
      fetchServers()
    } catch { setMessage('测试失败') }
  }

  const handleToggle = async (server: MCPServer) => {
    try {
      await fetch(`/api/mcp/servers/${server.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !server.enabled }),
      })
      fetchServers()
    } catch { /* ignore */ }
  }

  const startEdit = (server: MCPServer) => {
    setForm({
      name: server.name,
      transport: server.transport,
      command: server.command,
      args: (server.args || []).join(' '),
      url: server.url,
      env: server.env ? JSON.stringify(server.env) : '',
    })
    setEditing(server.name)
    setShowAdd(false)
  }

  const handleUpdate = async () => {
    if (!editing) return
    try {
      const updates: Record<string, unknown> = {
        transport: form.transport,
      }
      if (form.transport === 'stdio') {
        updates.command = form.command
        updates.args = form.args.split(/\s+/).filter(Boolean)
      } else {
        updates.url = form.url
      }
      if (form.env) {
        try { updates.env = JSON.parse(form.env) } catch { /* ignore */ }
      }

      const res = await fetch(`/api/mcp/servers/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`已更新: ${editing}`)
        resetForm()
        fetchServers()
      }
    } catch { setMessage('更新失败') }
  }

  const statusIcon = (status: string) => {
    if (status === 'connected') return '🟢'
    if (status === 'error') return '🔴'
    return '⚪'
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>MCP 服务器配置</span>
        <button style={s.btn} onClick={() => { resetForm(); setShowAdd(!showAdd) }}>
          {showAdd ? '取消' : '+ 添加'}
        </button>
      </div>

      {message && <div style={s.msg}>{message}</div>}

      {/* 服务器列表 */}
      <div style={s.list}>
        {loading ? <div style={s.empty}>加载中...</div> :
        servers.length === 0 ? <div style={s.empty}>暂无配置的 MCP 服务器</div> :
        servers.map(sv => (
          <div key={sv.name} style={s.serverCard}>
            <div style={s.serverHeader}>
              <span style={s.serverName}>{statusIcon(sv.status)} {sv.name}</span>
              <span style={s.serverStatus}>
                {sv.status === 'connected' ? `${sv.tools_count} 个工具` :
                 sv.status === 'error' ? sv.error_message : '未连接'}
              </span>
            </div>
            <div style={s.serverDetail}>
              {sv.transport === 'stdio'
                ? `${sv.command} ${(sv.args || []).join(' ')}`
                : sv.url}
            </div>
            {sv.last_connected && (
              <div style={s.serverMeta}>最后连接: {sv.last_connected}</div>
            )}
            <div style={s.serverActions}>
              <button style={s.btnSmall} onClick={() => handleTest(sv.name)}>测试</button>
              <button style={s.btnSmall} onClick={() => handleToggle(sv.name)}>
                {sv.enabled ? '禁用' : '启用'}
              </button>
              <button style={s.btnSmall} onClick={() => startEdit(sv)}>编辑</button>
              <button style={s.btnDanger} onClick={() => handleDelete(sv.name)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {/* 添加/编辑表单 */}
      {(showAdd || editing) && (
        <div style={s.form}>
          <div style={s.formTitle}>{editing ? `编辑: ${editing}` : '添加服务器'}</div>

          {!editing && (
            <div style={s.formRow}>
              <label style={s.label}>名称</label>
              <input style={s.input} value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="my-server" />
            </div>
          )}

          <div style={s.formRow}>
            <label style={s.label}>传输</label>
            <select style={s.input} value={form.transport}
              onChange={e => setForm({ ...form, transport: e.target.value })}>
              <option value="stdio">Stdio (本地进程)</option>
              <option value="streamable-http">HTTP (远程)</option>
            </select>
          </div>

          {form.transport === 'stdio' ? (
            <>
              <div style={s.formRow}>
                <label style={s.label}>命令</label>
                <input style={s.input} value={form.command}
                  onChange={e => setForm({ ...form, command: e.target.value })}
                  placeholder="npx" />
              </div>
              <div style={s.formRow}>
                <label style={s.label}>参数</label>
                <input style={s.input} value={form.args}
                  onChange={e => setForm({ ...form, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp" />
              </div>
            </>
          ) : (
            <div style={s.formRow}>
              <label style={s.label}>URL</label>
              <input style={s.input} value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="http://localhost:3000" />
            </div>
          )}

          <div style={s.formRow}>
            <label style={s.label}>环境变量</label>
            <input style={s.input} value={form.env}
              onChange={e => setForm({ ...form, env: e.target.value })}
              placeholder='{"KEY": "value"}' />
          </div>

          <div style={s.formActions}>
            <button style={s.btn} onClick={editing ? handleUpdate : handleAdd}>
              {editing ? '更新' : '添加'}
            </button>
            <button style={s.btnSecondary} onClick={resetForm}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
    background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.2)', maxHeight: '500px',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: '14px', fontWeight: 600, color: '#e2e8f0' },
  list: { display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'auto', maxHeight: '250px' },
  serverCard: {
    padding: '10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  },
  serverHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  serverName: { fontSize: '13px', fontWeight: 600, color: '#e2e8f0' },
  serverStatus: { fontSize: '10px', color: '#94a3b8' },
  serverDetail: { fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', marginBottom: '4px' },
  serverMeta: { fontSize: '10px', color: '#4b5563', marginBottom: '6px' },
  serverActions: { display: 'flex', gap: '6px' },
  form: {
    padding: '10px', borderRadius: '6px',
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
  },
  formTitle: { fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' },
  formRow: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' },
  label: { fontSize: '11px', color: '#94a3b8', minWidth: '60px' },
  input: {
    flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#e2e8f0', fontSize: '11px', outline: 'none',
  },
  formActions: { display: 'flex', gap: '8px', marginTop: '8px' },
  btn: {
    padding: '4px 10px', background: 'rgba(139,92,246,0.2)',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px',
    color: '#a78bfa', fontSize: '11px', cursor: 'pointer',
  },
  btnSecondary: {
    padding: '4px 10px', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px',
    color: '#94a3b8', fontSize: '11px', cursor: 'pointer',
  },
  btnSmall: {
    padding: '2px 8px', background: 'rgba(139,92,246,0.15)',
    border: '1px solid rgba(139,92,246,0.3)', borderRadius: '3px',
    color: '#a78bfa', fontSize: '10px', cursor: 'pointer',
  },
  btnDanger: {
    padding: '2px 8px', background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: '3px',
    color: '#ef4444', fontSize: '10px', cursor: 'pointer',
  },
  empty: { fontSize: '12px', color: '#6b7280', textAlign: 'center' as const, padding: '20px' },
  msg: { fontSize: '11px', color: '#34d399', padding: '4px 8px', background: 'rgba(52,211,153,0.1)', borderRadius: '4px' },
}
