import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildSystemPrompt } from '../agent/system-prompt'
import { loadSkillPacks } from '../skill/loader'

// skill_packs 目录
const PACKS_DIR = join(__dirname, '..', '..', '..', 'skill_packs')

describe('TS 端端到端注入测试', () => {
  let tmpDir: string

  beforeAll(async () => {
    // 创建临时增量区目录
    tmpDir = mkdtempSync(join(tmpdir(), 'mdh-e2e-'))
    const incDir = join(tmpDir, 'experience')
    mkdirSync(incDir, { recursive: true })
    mkdirSync(join(incDir, 'rules'), { recursive: true })
    mkdirSync(join(incDir, 'knowledge_add'), { recursive: true })

    // system_prompt_addon.md
    writeFileSync(
      join(incDir, 'system_prompt_addon.md'),
      '# 测试技能补充\n\n这是增量区的补充指令。',
    )

    // rules/test-rule.yaml
    writeFileSync(
      join(incDir, 'rules', 'test-rule.yaml'),
      'trigger_condition: "task_type is minutes"\naction: "必须为每项待办补充负责人与截止日期"\nrule_type: correction_tip\nkeywords: [纪要, 待办]\n',
    )

    // knowledge_add/meeting-rules.md
    writeFileSync(
      join(incDir, 'knowledge_add', 'meeting-rules.md'),
      '# 会议纪要规范\n\n必须包含：1. 决议 2. 行动项 3. 责任人 4. 截止日期',
    )

    // 加载技能包
    await loadSkillPacks(PACKS_DIR)
  })

  describe('增量区注入', () => {
    it('buildSystemPrompt 注入增量区 addon', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('测试技能补充')
      expect(prompt).toContain('增量区的补充指令')
    })

    it('buildSystemPrompt 注入增量区 rules', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('task_type is minutes')
      expect(prompt).toContain('必须为每项待办补充负责人与截止日期')
    })

    it('buildSystemPrompt 注入增量区 knowledge', async () => {
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

  describe('资产注入（mock）', () => {
    it('buildSystemPrompt 调用 buildAssetContext 不报错', async () => {
      // 资产注入依赖后端 API，这里测试不报错（fetch 失败静默跳过）
      const prompt = await buildSystemPrompt('executor', {
        asset: { backendUrl: 'http://localhost:99999', teamId: 'team-x' },
      })
      // 资产注入失败时静默跳过，prompt 仍然包含基础内容
      expect(prompt.length).toBeGreaterThan(50)
    })
  })

  describe('完整注入链路', () => {
    it('增量区 + 角色基础 prompt 完整注入', async () => {
      const prompt = await buildSystemPrompt('executor', {
        incremental: { incrementalDir: join(tmpDir, 'experience') },
      })

      // 基础角色 prompt
      expect(prompt.length).toBeGreaterThan(100)

      // 增量区内容
      expect(prompt).toContain('进化技能补充')
      expect(prompt).toContain('进化经验规则')
      expect(prompt).toContain('进化领域知识')

      // 工具指南（executor 角色）
      expect(prompt).toContain('工具指南')
    })
  })
})
