import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { RoleAgent } from '../role-agent.js';
import { buildSystemPrompt } from '../system-prompt.js';
import { getToolsForRole } from '../tools.js';
import { loadSkillPacks, resetCache } from '../../skill/loader.js';

const SKILL_PACKS_DIR = resolve(import.meta.dirname, '../../../../skill_packs');

describe('Agent Integration', () => {
  beforeAll(async () => {
    resetCache();
    await loadSkillPacks(SKILL_PACKS_DIR);
  });

  it('executor agent 的 system prompt 包含 frontend_dev 技能', async () => {
    const prompt = await buildSystemPrompt('executor');
    expect(prompt).toContain('组件驱动开发');
    expect(prompt).toContain('工具指南');
  });

  it('reviewer agent 的工具集不含 write_file', () => {
    const tools = getToolsForRole('reviewer');
    expect(tools.every(t => t.function.name !== 'write_file')).toBe(true);
  });

  it('多个 agent 实例的工具集和 system prompt 完全不同', async () => {
    const agentSpecs = await Promise.all(['executor', 'reviewer', 'coordinator', 'planner', 'monitor'].map(async roleId => ({
      roleId,
      systemPrompt: await buildSystemPrompt(roleId),
      tools: getToolsForRole(roleId).map(t => t.function.name),
    })));

    // executor 有 write_file，reviewer 没有
    expect(agentSpecs[0].tools).toContain('write_file');
    expect(agentSpecs[1].tools).not.toContain('write_file');

    // 所有角色的 system prompt 互不相同
    const prompts = new Set(agentSpecs.map(s => s.systemPrompt));
    expect(prompts.size).toBe(agentSpecs.length);

    // coordinator 无 bash 工具
    expect(agentSpecs[2].tools).not.toContain('bash');
    // monitor 有 bash 和 write_file
    expect(agentSpecs[4].tools).toContain('bash');
    expect(agentSpecs[4].tools).toContain('write_file');
  });

  it('executor 和 reviewer 的 RoleAgent 实例上下文完全隔离', async () => {
    const router = {
      execute: async () => ({ call_id: 'x', tool_name: 'read_file', result: 'content' }),
    };
    const llm = { provider: 'deepseek', apiKey: 'k', baseUrl: 'http://localhost', model: 'm' } as const;

    const executor = new RoleAgent({
      id: 'agent-executor',
      roleId: 'executor',
      roleName: '全栈开发',
      systemPrompt: await buildSystemPrompt('executor'),
      tools: getToolsForRole('executor'),
      router: router as any,
      workspace: '/tmp/w',
      llm,
    });
    const reviewer = new RoleAgent({
      id: 'agent-reviewer',
      roleId: 'reviewer',
      roleName: 'QA工程师',
      systemPrompt: await buildSystemPrompt('reviewer'),
      tools: getToolsForRole('reviewer'),
      router: router as any,
      workspace: '/tmp/w',
      llm,
    });

    expect(executor.messageCount).toBe(1);
    expect(reviewer.messageCount).toBe(1);
    expect(executor.systemPrompt).not.toBe(reviewer.systemPrompt);

    // 注入讨论上下文后，只有 reviewer 受影响
    reviewer.injectContext('讨论记录...');
    expect(reviewer.messageCount).toBe(2);
    expect(executor.messageCount).toBe(1);
  });
});
