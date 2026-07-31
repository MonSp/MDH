import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { buildSystemPrompt } from '../system-prompt.js';
import { loadSkillPacks, resetCache } from '../../skill/loader.js';

const SKILL_PACKS_DIR = resolve(import.meta.dirname, '../../../../skill_packs');

describe('buildSystemPrompt', () => {
  beforeAll(async () => {
    resetCache();
    await loadSkillPacks(SKILL_PACKS_DIR);
  });

  it('executor 的 prompt 包含角色名和工具指南', () => {
    const prompt = buildSystemPrompt('executor');
    expect(prompt).toContain('全栈开发');
    expect(prompt).toContain('工具指南');
  });

  it('executor 的 prompt 包含 skill pack 的 system_prompt.md（frontend_dev 组件驱动开发）', () => {
    const prompt = buildSystemPrompt('executor');
    expect(prompt).toContain('组件驱动开发');
  });

  it('reviewer 的 prompt 包含代码审查方法论', () => {
    const prompt = buildSystemPrompt('reviewer');
    expect(prompt).toContain('导师式审查');
  });

  it('coordinator 的 prompt 不包含工具指南', () => {
    const prompt = buildSystemPrompt('coordinator');
    expect(prompt).not.toContain('工具指南');
  });

  it('planner 的 prompt 包含架构方法论', () => {
    const prompt = buildSystemPrompt('planner');
    expect(prompt).toContain('渐进式架构');
  });

  it('未知角色返回默认 prompt', () => {
    const prompt = buildSystemPrompt('nonexistent_role');
    expect(prompt).toContain('助手');
  });
});
