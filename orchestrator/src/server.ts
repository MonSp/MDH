import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { resolve, extname, join } from 'path';
import { TeamCoordinator } from './team/coordinator.js';
import type { IToolkitRouter } from './toolkit/router.js';
import { RouterFactory } from './toolkit/router.js';
import { LLMConfig } from './llm/types.js';
import { resolveConfig } from './llm/openai.js';
import { getAvailableRoles } from './team/templates.js';

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

export async function startServer(port: number, routerFactory: RouterFactory, defaultRouter: IToolkitRouter, defaultWorkspace: string, defaultLlmConfig?: Partial<LLMConfig>) {
  const distDir = process.env.DIST_DIR || resolve(process.cwd(), '../dist');

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
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
        await handleMessage(ws, session, msg, routerFactory, defaultRouter);
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
  routerFactory: RouterFactory,
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

      const coordinator = new TeamCoordinator({
        llm: llmConfig,
        routerFactory,
        defaultRouter,
        workspace: session.workspace,
        onWorkspaceConfirm: (request) => {
          return new Promise((resolve) => {
            // 发送工作区确认请求给前端
            ws.send(JSON.stringify({
              type: 'workspace_confirm_request',
              task_description: request.taskDescription,
              suggested_type: request.suggestedType,
              options: request.options,
            }));

            // 等待前端回复 workspace_confirm_response
            const handler = (data: Buffer) => {
              try {
                const resp = JSON.parse(data.toString());
                if (resp.type === 'workspace_confirm_response') {
                  ws.removeListener('message', handler);
                  resolve({
                    workspace_type: resp.workspace_type || 'standalone',
                    repo_path: resp.repo_path,
                    branch_name: resp.branch_name,
                  });
                }
              } catch {}
            };
            ws.on('message', handler);
          });
        },
      });
      const content = msg.content as string;
      const DEFAULT_ROLES = ['coordinator', 'planner', 'executor', 'reviewer'];
      const selectedRoles = Array.isArray(msg.selected_roles) && msg.selected_roles.length > 0
        ? msg.selected_roles as string[]
        : DEFAULT_ROLES;

      console.log(`[WS] Task: "${content.substring(0, 60)}..." roles: [${selectedRoles.join(', ')}]`);

      // 读取前端 per-agent location 选择（如 { executor: 'remote', reviewer: 'local' }）
      const roleLocations = (msg.role_locations && typeof msg.role_locations === 'object')
        ? msg.role_locations as Record<string, 'local' | 'remote'>
        : undefined;
      if (roleLocations) {
        console.log(`[WS] roleLocations: ${JSON.stringify(roleLocations)}`);
      }

      try {
        const result = await coordinator.execute(content, selectedRoles, (event) => {
          // 转换 phase 事件为前端期望的 agenda_update 格式
          if (event.type === 'phase') {
            ws.send(JSON.stringify({
              type: 'agenda_update',
              agenda: { phase: event.phase, topic: content.substring(0, 50) },
            }));
          } else {
            ws.send(JSON.stringify(event));
          }
        }, roleLocations);
        ws.send(JSON.stringify({ type: 'task_result', content: result }));
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
