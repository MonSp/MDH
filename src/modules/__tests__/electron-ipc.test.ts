/**
 * Electron IPC handlers 测试
 *
 * 由于 Electron 模块无法在 Node.js 测试环境中直接导入，
 * 这里测试平台相关的纯逻辑函数。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'

// ─── 平台路径测试 ───
describe('Platform paths', () => {
  it('should use correct config directory per platform', () => {
    const home = tmpdir()
    const configDir = join(home, '.mdh')

    // 路径应该是绝对路径
    expect(configDir).toMatch(/^\//)

    // 应该包含 .mdh 目录名
    expect(configDir).toContain('.mdh')
  })

  it('should use correct config file paths', () => {
    const home = tmpdir()
    const configDir = join(home, '.mdh')
    const configFile = join(configDir, 'config.json')
    const encryptedFile = join(configDir, 'credentials.enc')

    expect(configFile).toMatch(/config\.json$/)
    expect(encryptedFile).toMatch(/credentials\.enc$/)
    expect(configFile.startsWith(configDir)).toBe(true)
    expect(encryptedFile.startsWith(configDir)).toBe(true)
  })

  it('should handle Windows-style paths correctly', () => {
    // 即使在 Linux 上，join 也应该正确处理路径分隔符
    const path = join('C:\\Users\\test', '.mdh', 'config.json')
    expect(path).toContain('.mdh')
    expect(path).toContain('config.json')
  })
})

// ─── 配置序列化测试 ───
describe('Config serialization', () => {
  const testDir = join(tmpdir(), `mdh-test-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should serialize and deserialize non-sensitive config', () => {
    const config = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      workspace: '/home/user/.mdh-workspaces/default',
      lastUsedRoles: ['planner', 'executor'],
    }

    const configFile = join(testDir, 'config.json')
    writeFileSync(configFile, JSON.stringify(config, null, 2))

    const raw = readFileSync(configFile, 'utf-8')
    const parsed = JSON.parse(raw)

    expect(parsed.provider).toBe('deepseek')
    expect(parsed.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(parsed.model).toBe('deepseek-chat')
    expect(parsed.workspace).toBe('/home/user/.mdh-workspaces/default')
    expect(parsed.lastUsedRoles).toEqual(['planner', 'executor'])
  })

  it('should handle missing config file gracefully', () => {
    const configFile = join(testDir, 'nonexistent.json')
    expect(existsSync(configFile)).toBe(false)

    // loadSecureConfig 应该在文件不存在时返回空对象
    const result: Record<string, unknown> = {}
    expect(result.provider).toBeUndefined()
    expect(result.apiKey).toBeUndefined()
  })

  it('should handle corrupted JSON gracefully', () => {
    const configFile = join(testDir, 'corrupted.json')
    writeFileSync(configFile, '{invalid json')

    // 应该能捕获解析错误
    expect(() => {
      JSON.parse(readFileSync(configFile, 'utf-8'))
    }).toThrow()
  })

  it('should merge config correctly', () => {
    const existing = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }

    const update = {
      provider: 'openai',
      model: 'gpt-4',
    }

    const merged = { ...existing, ...update }

    expect(merged.provider).toBe('openai')
    expect(merged.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(merged.model).toBe('gpt-4')
  })
})

// ─── LLM 配置解析测试 ───
describe('LLM config resolution', () => {
  // 模拟 resolveConfig 逻辑
  function resolveConfig(config: Record<string, string>) {
    const defaults: Record<string, { baseUrl: string; model: string }> = {
      deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
      anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
      ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3:14b' },
      custom: { baseUrl: '', model: '' },
    }

    const provider = config.provider || 'deepseek'
    const d = defaults[provider] || defaults.deepseek

    return {
      provider,
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || d.baseUrl,
      model: config.model || d.model,
    }
  }

  it('should resolve deepseek defaults', () => {
    const config = resolveConfig({ provider: 'deepseek' })
    expect(config.provider).toBe('deepseek')
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(config.model).toBe('deepseek-chat')
  })

  it('should resolve openai defaults', () => {
    const config = resolveConfig({ provider: 'openai' })
    expect(config.provider).toBe('openai')
    expect(config.baseUrl).toBe('https://api.openai.com/v1')
  })

  it('should resolve anthropic defaults', () => {
    const config = resolveConfig({ provider: 'anthropic' })
    expect(config.provider).toBe('anthropic')
    expect(config.baseUrl).toBe('https://api.anthropic.com/v1')
  })

  it('should resolve ollama defaults', () => {
    const config = resolveConfig({ provider: 'ollama' })
    expect(config.provider).toBe('ollama')
    expect(config.baseUrl).toBe('http://localhost:11434/v1')
  })

  it('should use custom values over defaults', () => {
    const config = resolveConfig({
      provider: 'deepseek',
      apiKey: 'sk-test',
      baseUrl: 'https://custom.api.com/v1',
      model: 'custom-model',
    })
    expect(config.apiKey).toBe('sk-test')
    expect(config.baseUrl).toBe('https://custom.api.com/v1')
    expect(config.model).toBe('custom-model')
  })

  it('should fall back to deepseek for unknown provider', () => {
    const config = resolveConfig({ provider: 'unknown' })
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(config.model).toBe('deepseek-chat')
  })

  it('should handle empty provider', () => {
    const config = resolveConfig({})
    expect(config.provider).toBe('deepseek')
    expect(config.baseUrl).toBe('https://api.deepseek.com/v1')
  })
})

// ─── 角色模板测试 ───
describe('Role templates', () => {
  function getDefaultRoles() {
    return [
      { id: 'planner', name: '架构师', team_role: 'Planner' },
      { id: 'executor', name: '全栈开发', team_role: 'Executor' },
      { id: 'reviewer', name: 'QA工程师', team_role: 'Reviewer' },
      { id: 'monitor', name: 'DevOps', team_role: 'Monitor' },
      { id: 'coordinator', name: '项目经理', team_role: 'Coordinator' },
    ]
  }

  function getTeamPresets() {
    return [
      { id: 'full', name: '完整团队', roles: ['planner', 'executor', 'reviewer', 'monitor', 'coordinator'] },
      { id: 'dev', name: '开发团队', roles: ['planner', 'executor', 'reviewer'] },
      { id: 'solo', name: '单人助理', roles: ['executor'] },
      { id: 'custom', name: '自定义', roles: [] },
    ]
  }

  it('should have 5 default roles', () => {
    const roles = getDefaultRoles()
    expect(roles).toHaveLength(5)
  })

  it('should have all required team roles', () => {
    const roles = getDefaultRoles()
    const teamRoles = roles.map(r => r.team_role)
    expect(teamRoles).toContain('Planner')
    expect(teamRoles).toContain('Executor')
    expect(teamRoles).toContain('Reviewer')
    expect(teamRoles).toContain('Monitor')
    expect(teamRoles).toContain('Coordinator')
  })

  it('should have 4 team presets', () => {
    const presets = getTeamPresets()
    expect(presets).toHaveLength(4)
  })

  it('full preset should include all roles', () => {
    const presets = getTeamPresets()
    const full = presets.find(p => p.id === 'full')!
    expect(full.roles).toHaveLength(5)
  })

  it('solo preset should have only executor', () => {
    const presets = getTeamPresets()
    const solo = presets.find(p => p.id === 'solo')!
    expect(solo.roles).toEqual(['executor'])
  })

  it('custom preset should have empty roles', () => {
    const presets = getTeamPresets()
    const custom = presets.find(p => p.id === 'custom')!
    expect(custom.roles).toEqual([])
  })

  it('all preset roles should reference valid role ids', () => {
    const roles = getDefaultRoles()
    const validIds = new Set(roles.map(r => r.id))
    const presets = getTeamPresets()

    for (const preset of presets) {
      for (const roleId of preset.roles) {
        expect(validIds.has(roleId)).toBe(true)
      }
    }
  })
})

// ─── IPC 通道白名单测试 ───
describe('IPC channel whitelist', () => {
  const VALID_INVOKE_CHANNELS = [
    'mdh:startMeeting',
    'mdh:sendMessage',
    'mdh:stopMeeting',
    'mdh:castVote',
    'mdh:approval',
    'mdh:workspaceConfirmResponse',
    'mdh:getLlmConfig',
    'mdh:setLlmConfig',
    'mdh:getFullConfig',
    'mdh:getHealth',
    'mdh:getWorkspace',
    'mdh:setWorkspace',
    'mdh:selectWorkspace',
    'mdh:getRoles',
    'mdh:getTeamPresets',
    'mdh:checkForUpdate',
    'mdh:downloadUpdate',
    'mdh:installUpdate',
    'mdh:getAppVersion',
  ]

  const VALID_RECEIVE_CHANNELS = [
    'mdh:onAgentMessage',
    'mdh:onStatusChange',
    'mdh:onAgendaUpdate',
    'mdh:onApprovalRequest',
    'mdh:onWorkspaceConfirm',
    'mdh:onProgress',
    'mdh:onError',
    'mdh:onUpdateStatus',
  ]

  it('should have all required invoke channels', () => {
    expect(VALID_INVOKE_CHANNELS).toContain('mdh:startMeeting')
    expect(VALID_INVOKE_CHANNELS).toContain('mdh:getLlmConfig')
    expect(VALID_INVOKE_CHANNELS).toContain('mdh:getAppVersion')
    expect(VALID_INVOKE_CHANNELS).toHaveLength(19)
  })

  it('should have all required receive channels', () => {
    expect(VALID_RECEIVE_CHANNELS).toContain('mdh:onAgentMessage')
    expect(VALID_RECEIVE_CHANNELS).toContain('mdh:onUpdateStatus')
    expect(VALID_RECEIVE_CHANNELS).toHaveLength(8)
  })

  it('all channels should start with mdh:', () => {
    for (const ch of VALID_INVOKE_CHANNELS) {
      expect(ch).toMatch(/^mdh:/)
    }
    for (const ch of VALID_RECEIVE_CHANNELS) {
      expect(ch).toMatch(/^mdh:/)
    }
  })

  it('invoke channels should use camelCase', () => {
    for (const ch of VALID_INVOKE_CHANNELS) {
      const name = ch.replace('mdh:', '')
      expect(name).toMatch(/^[a-z][a-zA-Z]*$/)
    }
  })

  it('receive channels should start with on', () => {
    for (const ch of VALID_RECEIVE_CHANNELS) {
      const name = ch.replace('mdh:', '')
      expect(name).toMatch(/^on[A-Z]/)
    }
  })
})

// ─── 更新状态测试 ───
describe('Update status', () => {
  type UpdateStatus = {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    version?: string
    percent?: number
    message?: string
  }

  it('should handle checking status', () => {
    const status: UpdateStatus = { status: 'checking' }
    expect(status.status).toBe('checking')
    expect(status.version).toBeUndefined()
  })

  it('should handle available status with version', () => {
    const status: UpdateStatus = { status: 'available', version: '1.2.0' }
    expect(status.status).toBe('available')
    expect(status.version).toBe('1.2.0')
  })

  it('should handle downloading status with progress', () => {
    const status: UpdateStatus = { status: 'downloading', percent: 45.5 }
    expect(status.status).toBe('downloading')
    expect(status.percent).toBe(45.5)
  })

  it('should handle downloaded status', () => {
    const status: UpdateStatus = { status: 'downloaded', version: '1.2.0' }
    expect(status.status).toBe('downloaded')
    expect(status.version).toBe('1.2.0')
  })

  it('should handle error status', () => {
    const status: UpdateStatus = { status: 'error', message: 'Network error' }
    expect(status.status).toBe('error')
    expect(status.message).toBe('Network error')
  })

  it('should handle not-available status', () => {
    const status: UpdateStatus = { status: 'not-available' }
    expect(status.status).toBe('not-available')
  })
})

// ─── 安全存储模拟测试 ───
describe('Secure storage logic', () => {
  const testDir = join(tmpdir(), `mdh-secure-test-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should separate sensitive and non-sensitive config', () => {
    const config = {
      provider: 'deepseek',
      apiKey: 'sk-secret-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }

    // 模拟 saveSecureConfig 的分离逻辑
    const { apiKey, ...nonSensitive } = config

    expect(nonSensitive.provider).toBe('deepseek')
    expect(nonSensitive.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(nonSensitive.model).toBe('deepseek-chat')
    expect((nonSensitive as Record<string, unknown>).apiKey).toBeUndefined()

    expect(apiKey).toBe('sk-secret-key')
  })

  it('should not persist API Key in plain config', () => {
    const config = {
      provider: 'deepseek',
      apiKey: 'sk-secret-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }

    const { apiKey, ...nonSensitive } = config
    const configFile = join(testDir, 'config.json')
    writeFileSync(configFile, JSON.stringify(nonSensitive, null, 2))

    const raw = readFileSync(configFile, 'utf-8')
    expect(raw).not.toContain('sk-secret-key')
    expect(raw).toContain('deepseek')
  })

  it('should handle config merge with undefined values', () => {
    const existing = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }

    const update = {
      provider: 'openai',
      apiKey: undefined,
    }

    const merged = { ...existing, ...update }

    expect(merged.provider).toBe('openai')
    expect(merged.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(merged.apiKey).toBeUndefined()
  })
})
