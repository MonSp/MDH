/**
 * TS 端集成测试：验证增量区注入 + 资产注入逻辑。
 *
 * 增量区测试：真实文件系统，无需后端。
 * 资产测试：尝试启动真实后端，不可用时跳过（agentscope 仅在 pytest 环境可用）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildSystemPrompt } from '../agent/system-prompt'
import { loadSkillPacks } from '../skill/loader'

const PACKS_DIR = join(__dirname, '..', '..', '..', 'skill_packs')
const BACKEND_URL = 'http://localhost:18765'

async function isBackendAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) })
    return resp.ok
  } catch { return false }
}

describe('TS 端集成测试', () => {
  let tmpDir: string
  let backendAvailable = false

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mdh-integration-'))
    const incDir = join(tmpDir, 'experience')
    mkdirSync(join(incDir, 'rules'), { recursive: true })
    mkdirSync(join(incDir, 'knowledge_add'), { recursive: true })

    writeFileSync(join(incDir, 'system_prompt_addon.md'), '# 集成测试补充\n\n这是集成测试的增量区内容。')
    writeFileSync(join(incDir, 'rules', 'int-rule.yaml'),
      'trigger_condition: "task_type is minutes"\naction: "必须补充责任人"\nrule_type: correction_tip\nkeywords: [纪要]\n')
    writeFileSync(join(incDir, 'knowledge_add', 'standards.md'), '# 集成测试规范\n\n所有代码必须有测试覆盖。')

    await loadSkillPacks(PACKS_DIR)
    backendAvailable = await isBackendAvailable()
  }, 30_000)

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  describe('增量区注入（真实文件系统）', () => {
    it('注入 addon 到 system prompt', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('集成测试的增量区内容')
    })

    it('注入 rules 到 system prompt', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('task_type is minutes')
      expect(prompt).toContain('必须补充责任人')
    })

    it('注入 knowledge 到 system prompt', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化领域知识')
      expect(prompt).toContain('集成测试规范')
      expect(prompt).toContain('所有代码必须有测试覆盖')
    })

    it('完整 prompt 包含角色基础 + 增量区 + 工具指南', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt.length).toBeGreaterThan(200)
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('进化领域知识')
      expect(prompt).toContain('工具指南')
    })

    it('无增量区时 prompt 不含进化内容', async () => {
      const prompt = await buildSystemPrompt('executor')
      expect(prompt).not.toContain('进化技能补充')
      expect(prompt).not.toContain('进化经验规则')
      expect(prompt).not.toContain('进化领域知识')
    })
  })

  describe('资产注入（真实后端）', () => {
    it.skipIf(!backendAvailable)('后端 /health 可达', async () => {
      const resp = await fetch(`${BACKEND_URL}/health`)
      expect(resp.ok).toBe(true)
    })

    it.skipIf(!backendAvailable)('后端 /api/assets/search 返回数据', async () => {
      const resp = await fetch(`${BACKEND_URL}/api/assets/search?team_id=team-x`)
      expect(resp.ok).toBe(true)
      const data = await resp.json() as { data: unknown }
      expect(data.data).toBeDefined()
    })

    it.skipIf(!backendAvailable)('buildSystemPrompt 注入真实后端资产', async () => {
      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: BACKEND_URL, teamId: 'team-x' },
      })
      expect(prompt.length).toBeGreaterThan(50)
    })

    it.skipIf(!backendAvailable)('增量区 + 资产 + 角色完整注入', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
        asset: { backendUrl: BACKEND_URL, teamId: 'team-x' },
      })
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('进化领域知识')
      expect(prompt).toContain('工具指南')
    })
  })
})
