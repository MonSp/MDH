import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LocalToolkitRouter } from './local.js';
import { ToolCall } from '../team/types.js';

const FIXTURE = join(import.meta.dirname, '__test_workspace__');

function makeCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

beforeEach(() => {
  mkdirSync(FIXTURE, { recursive: true });
});

afterEach(() => {
  rmSync(FIXTURE, { recursive: true, force: true });
});

describe('LocalToolkitRouter', () => {
  const router = new LocalToolkitRouter();

  it('read_file returns file contents', async () => {
    writeFileSync(join(FIXTURE, 'hello.txt'), 'world');
    const result = await router.execute(makeCall('read_file', { path: 'hello.txt' }), FIXTURE);
    expect(result.error).toBeUndefined();
    expect(result.result).toBe('world');
  });

  it('write_file creates a file and read_file retrieves it', async () => {
    const result = await router.execute(
      makeCall('write_file', { path: 'out.txt', content: 'hello' }),
      FIXTURE,
    );
    expect(result.error).toBeUndefined();
    expect(readFileSync(join(FIXTURE, 'out.txt'), 'utf-8')).toBe('hello');
  });

  it('bash executes a command and returns output', async () => {
    const result = await router.execute(makeCall('bash', { command: 'echo hi' }), FIXTURE);
    expect(result.error).toBeUndefined();
    expect(String(result.result).trim()).toBe('hi');
  });

  it('blocks path traversal outside workspace', async () => {
    const result = await router.execute(
      makeCall('read_file', { path: '../../../etc/passwd' }),
      FIXTURE,
    );
    expect(result.error).toContain('Path traversal denied');
  });
});
