import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { startServer } from './server.js';
import { resolveConfig } from './llm/openai.js';
import type { IToolkitRouter } from './toolkit/router.js';
import { RemoteToolkitRouter } from './toolkit/remote.js';
import { LocalToolkitRouter } from './toolkit/local.js';

// Load .env file from project root
function loadEnv() {
  const envPath = resolve(process.cwd(), '../.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const port = parseInt(getArg('port', '9090'));
const executorUrl = getArg('executor', process.env.EXECUTOR_URL || 'http://localhost:8767');
const executorToken = getArg('executor-token', process.env.EXECUTOR_TOKEN || '');
const workspace = getArg('workspace', process.env.WORKSPACE || '/workspace');

// Pre-load LLM config from environment
const defaultLlmConfig = resolveConfig({
  provider: (process.env.LLM_PROVIDER || 'deepseek') as any,
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '',
  baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.LLM_BASE_URL || '',
  model: process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL || '',
});

async function main() {
  console.log('========================================');
  console.log('  MDH Orchestrator');
  console.log('========================================');

  const hasExecutorArg = args.some(a => a.startsWith('--executor='));
  const hasExecutorEnv = !!process.env.EXECUTOR_URL;
  const useRemote = hasExecutorArg || hasExecutorEnv;

  let toolkitRouter: IToolkitRouter;
  if (useRemote) {
    toolkitRouter = new RemoteToolkitRouter({ executorUrl, token: executorToken });
    console.log(`[OK]   Router: RemoteToolkitRouter → ${executorUrl}`);
  } else {
    toolkitRouter = new LocalToolkitRouter();
    console.log(`[OK]   Router: LocalToolkitRouter`);
  }

  if (defaultLlmConfig.apiKey) {
    console.log(`[OK]   LLM: ${defaultLlmConfig.provider} / ${defaultLlmConfig.model}`);
  } else {
    console.warn('[WARN] No API Key configured. Set DEEPSEEK_API_KEY in .env');
  }

  await startServer(port, toolkitRouter, workspace, defaultLlmConfig);
  console.log(`[OK]   http://localhost:${port}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
