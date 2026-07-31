import { describe, it, expect } from 'vitest';
import { getToolsForRole, ALL_TOOL_DEFINITIONS } from '../tools.js';

describe('getToolsForRole', () => {
  it('executor 应包含 write_file, read_file, bash', () => {
    const tools = getToolsForRole('executor');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('write_file');
    expect(names).toContain('read_file');
    expect(names).toContain('bash');
  });

  it('reviewer 应包含 read_file 和 grep_content，不含 write_file', () => {
    const tools = getToolsForRole('reviewer');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('grep_content');
    expect(names).not.toContain('write_file');
  });

  it('coordinator 应只有 read_file 和 git_status，无 bash', () => {
    const tools = getToolsForRole('coordinator');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('git_status');
    expect(names).not.toContain('bash');
    expect(names).not.toContain('write_file');
  });

  it('未知角色返回全量工具', () => {
    const tools = getToolsForRole('nonexistent');
    expect(tools).toEqual(ALL_TOOL_DEFINITIONS);
  });

  it('planner 应包含 read_file 和 list_directory，不含 write_file', () => {
    const tools = getToolsForRole('planner');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('list_directory');
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('bash');
  });

  it('monitor 应包含 write_file 和 bash', () => {
    const tools = getToolsForRole('monitor');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('write_file');
    expect(names).toContain('bash');
    expect(names).toContain('git_commit');
  });
});
