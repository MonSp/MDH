import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { HybridToolkitRouter, createExecutionConfig } from './hybrid.js';

const TEST_DIR = join('/tmp', `hybrid-test-${Date.now()}`);

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('HybridToolkitRouter', () => {
  it('remote-brain-local-hands: write_file goes to local', async () => {
    const config = createExecutionConfig('remote-brain-local-hands', {
      localWorkspace: TEST_DIR,
    });
    const router = new HybridToolkitRouter(config);

    const result = await router.execute(
      { id: 'c1', function: { name: 'write_file', arguments: JSON.stringify({ path: 'test.txt', content: 'hello' }) } },
      '/remote/workspace',
    );
    expect(result.error).toBeUndefined();
    expect(readFileSync(join(TEST_DIR, 'test.txt'), 'utf-8')).toBe('hello');
  });

  it('remote-brain-local-hands: read_file reads from local', async () => {
    writeFileSync(join(TEST_DIR, 'data.txt'), 'local data');
    const config = createExecutionConfig('remote-brain-local-hands', {
      localWorkspace: TEST_DIR,
    });
    const router = new HybridToolkitRouter(config);

    const result = await router.execute(
      { id: 'c2', function: { name: 'read_file', arguments: JSON.stringify({ path: 'data.txt' }) } },
      '/remote/workspace',
    );
    expect(result.result).toBe('local data');
  });

  it('local-full: all tools use local router', async () => {
    const config = createExecutionConfig('local-full', { localWorkspace: TEST_DIR });
    const router = new HybridToolkitRouter(config);

    const result = await router.execute(
      { id: 'c3', function: { name: 'write_file', arguments: JSON.stringify({ path: 'a.txt', content: 'A' }) } },
      '/any/workspace',
    );
    expect(readFileSync(join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('A');
  });

  it('custom profile: files local, commands remote', () => {
    const config = createExecutionConfig('custom', {
      localWorkspace: TEST_DIR,
      overrides: { files: 'local', commands: 'remote' },
    });
    expect(config.files).toBe('local');
    expect(config.commands).toBe('remote');
  });

  it('creates config from profile correctly', () => {
    const config = createExecutionConfig('remote-brain-local-hands', {
      localWorkspace: '/home/user/project',
    });
    expect(config.llm).toBe('remote');
    expect(config.agents).toBe('remote');
    expect(config.files).toBe('local');
    expect(config.commands).toBe('local');
    expect(config.localWorkspace).toBe('/home/user/project');
  });

  it('throws on unknown ExecutionProfile', () => {
    expect(() => createExecutionConfig('bogus' as any, { localWorkspace: TEST_DIR }))
      .toThrow('unknown ExecutionProfile: bogus');
  });
});
