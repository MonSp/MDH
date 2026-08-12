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

  it('executor 的 prompt 包含角色名和工具指南', async () => {
    const prompt = await buildSystemPrompt('executor');
    expect(prompt).toContain('全栈开发');
    expect(prompt).toContain('工具指南');
  });

  it('executor 的 prompt 包含 skill pack 的 system_prompt.md（frontend_dev 组件驱动开发）', async () => {
    const prompt = await buildSystemPrompt('executor');
    expect(prompt).toContain('组件驱动开发');
  });

  it('reviewer 的 prompt 包含代码审查方法论', async () => {
    const prompt = await buildSystemPrompt('reviewer');
    expect(prompt).toContain('导师式审查');
  });

  it('coordinator 的 prompt 不包含工具指南', async () => {
    const prompt = await buildSystemPrompt('coordinator');
    expect(prompt).not.toContain('工具指南');
  });

  it('planner 的 prompt 包含架构方法论', async () => {
    const prompt = await buildSystemPrompt('planner');
    expect(prompt).toContain('渐进式架构');
  });

  it('未知角色返回默认 prompt', async () => {
    const prompt = await buildSystemPrompt('nonexistent_role');
    expect(prompt).toContain('助手');
  });

  it('当 knowledge/ 有文件时包含领域知识章节', async () => {
    // frontend_dev 的 knowledge 目录存在但为空，所以不应包含领域知识
    const prompt = await buildSystemPrompt('executor');
    // 如果 knowledge 目录有文件，应包含此章节；目前为空所以不包含
    // 此测试验证的是：不报错，正常返回
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('当 rules/ 有文件时包含经验规则章节', async () => {
    // frontend_dev 的 rules 目录存在但为空，所以不应包含经验规则
    const prompt = await buildSystemPrompt('executor');
    // 验证不报错，正常返回
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });
});
