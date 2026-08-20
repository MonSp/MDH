import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildSystemPrompt } from '../agent/system-prompt'
import { loadSkillPacks } from '../skill/loader'

const PACKS_DIR = join(__dirname, '..', '..', '..', 'skill_packs')

describe('TS 端端到端注入测试', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mdh-e2e-'))
    const incDir = join(tmpDir, 'experience')
    mkdirSync(incDir, { recursive: true })
    mkdirSync(join(incDir, 'rules'), { recursive: true })
    mkdirSync(join(incDir, 'knowledge_add'), { recursive: true })

    writeFileSync(
      join(incDir, 'system_prompt_addon.md'),
      '# 测试技能补充\n\n这是增量区的补充指令。',
    )
    writeFileSync(
      join(incDir, 'rules', 'test-rule.yaml'),
      'trigger_condition: "task_type is minutes"\naction: "必须为每项待办补充负责人与截止日期"\nrule_type: correction_tip\nkeywords: [纪要, 待办]\n',
    )
    writeFileSync(
      join(incDir, 'knowledge_add', 'meeting-rules.md'),
      '# 会议纪要规范\n\n必须包含：1. 决议 2. 行动项 3. 责任人 4. 截止日期',
    )

    await loadSkillPacks(PACKS_DIR)
  })

  describe('增量区注入', () => {
    it('注入增量区 addon', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('测试技能补充')
      expect(prompt).toContain('增量区的补充指令')
    })

    it('注入增量区 rules', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('task_type is minutes')
      expect(prompt).toContain('必须为每项待办补充负责人与截止日期')
    })

    it('注入增量区 knowledge', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化领域知识')
      expect(prompt).toContain('会议纪要规范')
    })

    it('无增量区时不影响基础 prompt', async () => {
      const prompt = await buildSystemPrompt('executor')
      expect(prompt).not.toContain('进化技能补充')
      expect(prompt).not.toContain('进化经验规则')
      expect(prompt).not.toContain('进化领域知识')
    })

    it('空增量区目录不报错', async () => {
      const emptyDir = join(tmpDir, 'empty')
      mkdirSync(emptyDir, { recursive: true })
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: emptyDir },
      })
      expect(prompt).not.toContain('进化')
    })
  })

  describe('资产注入（真实 mock fetch）', () => {
    const mockAssetResponse = {
      data: {
        templates: [
          { title: '会议纪要模板', content: '标题\n要点\n待办\n决定\n行动项\n责任人与日期' },
          { title: '代码审查模板', content: '变更描述\n影响范围\n测试计划\n回滚方案' },
        ],
        artifacts: [
          { title: '发布计划纪要', content: '8月15日上线，市场部负责宣传物料，研发部负责版本冻结。技术选型采用 React + FastAPI。' },
          { title: '架构设计文档', content: '系统采用微服务架构，前端 React，后端 FastAPI，数据库 PostgreSQL。' },
        ],
        rules: [
          { trigger_condition: 'task_type is minutes', action: '必须为每项待办补充负责人与截止日期' },
          { trigger_condition: 'task_type is code_review', action: '必须检查错误处理和类型安全' },
        ],
      },
    }

    it('注入模板资产', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAssetResponse),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x', taskType: 'minutes', keywords: ['纪要'] },
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/assets/search'),
      )
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('team_id=team-x'),
      )
      expect(prompt).toContain('资产参考')
      expect(prompt).toContain('会议纪要模板')
      expect(prompt).toContain('代码审查模板')

      vi.restoreAllMocks()
    })

    it('注入产出物资产', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAssetResponse),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      expect(prompt).toContain('发布计划纪要')
      expect(prompt).toContain('架构设计文档')

      vi.restoreAllMocks()
    })

    it('注入经验规则资产', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAssetResponse),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      expect(prompt).toContain('task_type is minutes')
      expect(prompt).toContain('补充负责人与截止日期')

      vi.restoreAllMocks()
    })

    it('内容截断到100字符', async () => {
      const longContent = 'A'.repeat(200)
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            templates: [{ title: '长内容模板', content: longContent }],
            artifacts: [],
            rules: [],
          },
        }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      // 截断到100字符 + 省略号
      expect(prompt).toContain('…')
      expect(prompt).not.toContain('A'.repeat(101))

      vi.restoreAllMocks()
    })

    it('API 失败时静默跳过', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      // 不包含资产参考，但基础 prompt 正常
      expect(prompt).not.toContain('资产参考')
      expect(prompt.length).toBeGreaterThan(50)

      vi.restoreAllMocks()
    })

    it('空资产返回时不注入', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { templates: [], artifacts: [], rules: [] } }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      expect(prompt).not.toContain('资产参考')

      vi.restoreAllMocks()
    })

    it('taskType 和 keywords 传递到 API 参数', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { templates: [], artifacts: [], rules: [] } }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x', taskType: 'minutes', keywords: ['纪要', '待办'] },
      })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toContain('team_id=team-x')
      expect(calledUrl).toContain('task_type=minutes')
      expect(calledUrl).toContain('keywords=%E7%BA%AA%E8%A6%81')  // URL-encoded 纪要

      vi.restoreAllMocks()
    })
  })

  describe('完整注入链路', () => {
    it('增量区 + 资产 + 角色 prompt 完整注入', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            templates: [{ title: '发布模板', content: '发布流程模板内容' }],
            artifacts: [{ title: '架构文档', content: '系统架构设计文档' }],
            rules: [{ trigger_condition: '部署前检查', action: '运行全量测试' }],
          },
        }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
        asset: { backendUrl: 'http://localhost:8765', teamId: 'team-x' },
      })

      // 基础角色 prompt
      expect(prompt.length).toBeGreaterThan(200)

      // 增量区内容
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('进化领域知识')

      // 资产内容
      expect(prompt).toContain('资产参考')
      expect(prompt).toContain('发布模板')
      expect(prompt).toContain('架构文档')
      expect(prompt).toContain('部署前检查')

      // 工具指南
      expect(prompt).toContain('工具指南')

      vi.restoreAllMocks()
    })
  })
})
