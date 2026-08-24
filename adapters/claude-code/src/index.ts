/**
 * Claude Code A2A Adapter — main entry point.
 *
 * Starts an HTTP server that exposes A2A protocol endpoints and wraps
 * Claude Code CLI as an A2A server for the MDH Python backend.
 *
 * Usage:
 *   tsx src/index.ts [--port 9091] [--backend http://localhost:8765]
 */

import { createServer } from 'node:http';
import { createA2AHandler } from './a2a-handler.js';
import { StateCache } from './state-cache.js';

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(): { port: number; backendUrl: string } {
  const args = process.argv.slice(2);
  let port = 9091;
  let backendUrl = 'http://localhost:8765';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--backend' && args[i + 1]) {
      backendUrl = args[i + 1];
      i++;
    }
  }

  return { port, backendUrl };
}

// ─── Registration ────────────────────────────────────────────────────────────

const AGENT_ID = 'claude-code';

const AGENT_CARD = {
  name: 'claude-code',
  description: 'Anthropic Claude Code — local AI coding assistant',
  url: '', // Set dynamically from port
  version: '1.0.0',
  capabilities: { streaming: true },
  skills: [
    {
      id: 'code_implementation',
      name: 'Code Implementation',
      tags: ['file', 'git', 'shell', 'search', 'code', 'test'],
      description: 'Implement code changes: write files, run commands, create tests, manage git',
    },
    {
      id: 'code_review',
      name: 'Code Review',
      tags: ['review', 'code', 'security'],
      description: 'Review code for correctness, security, style, and best practices',
    },
  ],
};

async function registerWithBackend(backendUrl: string, port: number, stateCache: StateCache): Promise<boolean> {
  const card = { ...AGENT_CARD, url: `http://localhost:${port}` };

  try {
    const res = await fetch(`${backendUrl}/api/a2a/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: AGENT_ID, card }),
    });

    if (!res.ok) {
      console.error(`[register] Failed: HTTP ${res.status}`);
      return false;
    }

    const data = await res.json() as { success: boolean };
    if (data.success) {
      stateCache.saveState({
        agent_id: AGENT_ID,
        backend_url: backendUrl,
        registered_at: new Date().toISOString(),
      });
      console.log(`[register] Successfully registered with backend at ${backendUrl}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[register] Error connecting to backend:`, err);
    return false;
  }
}

async function unregisterFromBackend(backendUrl: string): Promise<void> {
  try {
    await fetch(`${backendUrl}/api/a2a/unregister/${AGENT_ID}`, { method: 'POST' });
    console.log(`[unregister] Unregistered from backend`);
  } catch {
    // Best-effort cleanup
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(backendUrl: string): void {
  heartbeatTimer = setInterval(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/a2a/heartbeat/${AGENT_ID}`, { method: 'POST' });
      if (!res.ok) {
        console.warn(`[heartbeat] Failed: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[heartbeat] Error:`, err);
    }
  }, 30_000); // Every 30 seconds
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { port, backendUrl } = parseArgs();
  const stateCache = new StateCache();
  stateCache.ensureDirs();

  const a2aHandler = createA2AHandler({ stateCache, backendUrl });

  const server = createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agent_id: AGENT_ID }));
      return;
    }

    // Try A2A handler
    const handled = await a2aHandler(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port, async () => {
    console.log(`[claude-code-adapter] Listening on http://localhost:${port}`);
    console.log(`[claude-code-adapter] Agent Card: http://localhost:${port}/.well-known/agent.json`);

    // Register with backend
    const registered = await registerWithBackend(backendUrl, port, stateCache);
    if (registered) {
      startHeartbeat(backendUrl);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[claude-code-adapter] Shutting down...');
    stopHeartbeat();
    await unregisterFromBackend(backendUrl);
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[claude-code-adapter] Fatal error:', err);
  process.exit(1);
});
