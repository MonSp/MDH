import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { startServer } from './server.js';
import { resolveConfig } from './llm/openai.js';
import type { IToolkitRouter } from './toolkit/router.js';
import { RemoteToolkitRouter } from './toolkit/remote.js';
import { LocalToolkitRouter } from './toolkit/local.js';
import { HybridToolkitRouter, createExecutionConfig, type ExecutionProfile } from './toolkit/hybrid.js';

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
const profile = getArg('profile', process.env.MDH_PROFILE || '') as ExecutionProfile | '';
const localWorkspace = getArg('local-workspace', process.env.LOCAL_WORKSPACE || process.cwd());

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

  let defaultRouter: IToolkitRouter;

  if (profile) {
    // HybridToolkitRouter with profile
    const config = createExecutionConfig(profile, {
      localWorkspace,
      remote: { executorUrl, token: executorToken },
    });
    defaultRouter = new HybridToolkitRouter(config);
    console.log(`[OK]   Profile: ${profile}`);
    console.log(`[OK]   Files: ${config.files}, Commands: ${config.commands}`);
    console.log(`[OK]   Local workspace: ${localWorkspace}`);
    if (config.remote) {
      console.log(`[OK]   Remote executor: ${executorUrl}`);
    }
  } else {
    // Legacy mode: all-or-nothing
    const hasExecutorArg = args.some(a => a.startsWith('--executor='));
    const hasExecutorEnv = !!process.env.EXECUTOR_URL;
    const useRemote = hasExecutorArg || hasExecutorEnv;

    if (useRemote) {
      defaultRouter = new RemoteToolkitRouter({ executorUrl, token: executorToken });
      console.log(`[OK]   Router: RemoteToolkitRouter → ${executorUrl}`);
    } else {
      defaultRouter = new LocalToolkitRouter();
      console.log(`[OK]   Router: LocalToolkitRouter`);
    }
  }

  if (defaultLlmConfig.apiKey) {
    console.log(`[OK]   LLM: ${defaultLlmConfig.provider} / ${defaultLlmConfig.model}`);
  } else {
    console.warn('[WARN] No API Key configured. Set DEEPSEEK_API_KEY in .env');
  }

  await startServer(port, defaultRouter, workspace, defaultLlmConfig);
  console.log(`[OK]   http://localhost:${port}`);
  console.log('========================================');
  console.log('');
  console.log('  Profiles:');
  console.log('    local-full              高配：全部本地');
  console.log('    remote-full             纯云端：全部远端');
  console.log('    remote-brain-local-hands  低配：远端推理+本地执行');
  console.log('    custom                  自定义 (用 --files=local --commands=local)');
  console.log('');
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
