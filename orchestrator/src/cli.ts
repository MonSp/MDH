import { startServer } from './server.js';
import { ExecutorClient } from './executor/client.js';
import { resolveConfig } from './llm/openai.js';

const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const port = parseInt(getArg('port', '9090'));
const executorUrl = getArg('executor', process.env.EXECUTOR_URL || 'http://localhost:8767');
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

  const executor = new ExecutorClient(executorUrl);
  const healthy = await executor.health();
  if (!healthy) {
    console.warn(`[WARN] Executor at ${executorUrl} is not reachable`);
  } else {
    console.log(`[OK]   Executor: ${executorUrl}`);
  }

  if (defaultLlmConfig.apiKey) {
    console.log(`[OK]   LLM: ${defaultLlmConfig.provider} / ${defaultLlmConfig.model}`);
  } else {
    console.warn('[WARN] No API Key configured. Set DEEPSEEK_API_KEY in .env');
  }

  await startServer(port, executorUrl, workspace, defaultLlmConfig);
  console.log(`[OK]   http://localhost:${port}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
