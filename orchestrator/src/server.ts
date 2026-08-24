import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { existsSync, createReadStream } from 'fs';
import { resolve, extname, join } from 'path';
import type { IToolkitRouter } from './toolkit/router.js';
import { LLMConfig } from './llm/types.js';
import { resolveConfig } from './llm/openai.js';
import { getAvailableRoles } from './team/templates.js';
import { RoleAgent, type AgentConfig, type EventHandler } from './agent/role-agent.js';
import { ALL_TOOL_DEFINITIONS } from './agent/tools.js';
import { buildSystemPrompt } from './agent/system-prompt.js';
import { createA2AHandler } from './a2a/server.js';

interface ClientSession {
  config: Partial<LLMConfig>;
  workspace: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export async function startServer(port: number, defaultRouter: IToolkitRouter, defaultWorkspace: string, defaultLlmConfig?: Partial<LLMConfig>) {
  const distDir = process.env.DIST_DIR || resolve(process.cwd(), '../dist');

  // A2A handler — serves /.well-known/agent.json and POST /a2a/tasks/send
  const handleA2A = createA2AHandler({
    llmConfig: defaultLlmConfig ? resolveConfig(defaultLlmConfig) : resolveConfig({ provider: 'deepseek' }),
    workspace: defaultWorkspace,
    router: defaultRouter,
  });

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // A2A routes — delegate if matched
    try {
      const handled = await handleA2A(req, res);
      if (handled) return;
    } catch (err: unknown) {
      // A2A handler threw before writing a response — return 500
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    const url = req.url || '/';

    // API endpoints
    if (url === '/api/roles') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getAvailableRoles()));
      return;
    }
    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Serve static frontend files
    let filePath = url === '/' ? '/index.html' : url;
    filePath = join(distDir, filePath);

    if (!existsSync(filePath)) {
      filePath = join(distDir, 'index.html');
    }

    const ext = extname(filePath);
    if (existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'text/plain' });
      createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // Attach WebSocket server to HTTP server — accept both / and /ws/ paths
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = req.url || '/';
    if (url === '/' || url === '/ws' || url === '/ws/') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('[WS] Client connected');

    const session: ClientSession = {
      config: defaultLlmConfig ? { ...defaultLlmConfig } : { provider: 'deepseek' },
      workspace: defaultWorkspace,
    };

    ws.send(JSON.stringify({
      type: 'connected',
      roles: getAvailableRoles(),
    }));

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, session, msg, defaultRouter);
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });
  });

  httpServer.listen(port, () => {
    console.log(`[HTTP+WS] Listening on http://localhost:${port}`);
  });

  return { httpServer, wss };
}

async function handleMessage(
  ws: WebSocket,
  session: ClientSession,
  msg: Record<string, unknown>,
  defaultRouter: IToolkitRouter,
) {
  switch (msg.type) {
    case 'config': {
      session.config = { ...session.config, ...(msg.config as Partial<LLMConfig>) };
      session.workspace = (msg.workspace as string) || session.workspace;
      ws.send(JSON.stringify({ type: 'config_updated' }));
      console.log('[WS] Config:', session.config.provider, session.config.model);
      break;
    }

    case 'user_message':
    case 'unified_message': {
      // Support both: config-in-message (MDH frontend) and pre-configured session
      if (msg.provider || msg.api_key || msg.base_url || msg.model_name) {
        if (msg.provider) session.config.provider = msg.provider as string;
        if (msg.api_key) session.config.apiKey = msg.api_key as string;
        if (msg.base_url) session.config.baseUrl = msg.base_url as string;
        if (msg.model_name) session.config.model = msg.model_name as string;
      }

      const llmConfig = resolveConfig(session.config);
      if (!llmConfig.apiKey) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'API Key not configured. Set it in settings panel.',
        }));
        return;
      }

      const content = msg.content as string;
      console.log(`[WS] Task: "${content.substring(0, 60)}..." (single-agent mode)`);

      // Create a single RoleAgent — A2A execution model
      const systemPrompt = await buildSystemPrompt('executor');
      const agentConfig: AgentConfig = {
        id: `ws-${Date.now()}`,
        roleId: 'executor',
        roleName: 'Executor',
        systemPrompt,
        tools: ALL_TOOL_DEFINITIONS,
        router: defaultRouter,
        workspace: session.workspace,
        llm: llmConfig,
      };
      const agent = new RoleAgent(agentConfig);

      try {
        ws.send(JSON.stringify({ type: 'agenda_update', agenda: { phase: 'executing', topic: content.substring(0, 50) } }));

        const onEvent: EventHandler = (event) => {
          switch (event.type) {
            case 'tool_result':
              ws.send(JSON.stringify({ type: 'tool_result', tool_name: event.tool, output: event.output ?? event.result }));
              break;
            case 'tool_call':
              ws.send(JSON.stringify({ type: 'tool_call', tool_name: event.tool, arguments: event.args }));
              break;
            case 'agent_message':
              ws.send(JSON.stringify({ type: 'agent_message', content: event.content }));
              break;
            default:
              ws.send(JSON.stringify(event));
              break;
          }
        };

        const { result } = await agent.chatWithTools(content, onEvent);
        ws.send(JSON.stringify({ type: 'task_result', content: result, path_used: 'single-agent' }));
      } catch (err: any) {
        console.error('[WS] Error:', err.message);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }

    case 'list_roles': {
      ws.send(JSON.stringify({ type: 'roles_list', roles: getAvailableRoles() }));
      break;
    }

    case 'workspace_confirm_response': {
      // 由 onWorkspaceConfirm 回调中的 listener 处理，这里不做额外操作
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
  }
}
