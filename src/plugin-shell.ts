export enum ErrorCode {
  INVALID_COMMAND = 'INVALID_COMMAND',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  EXEC_ERROR = 'EXEC_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_ORIGIN = 'INVALID_ORIGIN',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  MANIFEST_STALE = 'MANIFEST_STALE',
  TARGET_STALE = 'TARGET_STALE',
  CANCELLED = 'CANCELLED',
  ERR_NOT_IMPLEMENTED = 'ERR_NOT_IMPLEMENTED',
}

type MessageType = 'request' | 'response' | 'event';

interface BridgeError {
  code: ErrorCode;
  message: string;
  detail?: any;
}

interface Message {
  id: string;
  type: MessageType;
  command?: string;
  payload?: any;
  error?: BridgeError;
  timestamp: number;
  manifest_version?: string;
}

export interface LogEntry {
  type: 'request' | 'response' | 'event' | 'error';
  command: string;
  payload?: any;
  timestamp: number;
  source: 'user' | 'iframe' | 'parent';
}

export type LogCallback = (entry: LogEntry) => void;

export interface ShellConfig {
  iframe: HTMLIFrameElement;
  appOrigin: string;
  parentOrigin: string;
  onLog?: LogCallback;
}

export interface PageContext {
  url: string;
  title: string;
  page_type: string;
  tools?: Array<{ tool: string; label: string; risk: string }>;
}

export type PageContextCallback = (ctx: PageContext) => void;

const PARENT_ORIGIN_DEFAULT = 'chrome://ai-automation-side-panel.top-chrome';
const SELF_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const isStandalone = typeof window !== 'undefined' && window.parent === window;

const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; command: string }>();
let counter = 0;
let currentManifestVersion = '';
let handshakeSent = false;

let onPageContext: PageContextCallback | null = null;

export function setPageContextCallback(cb: PageContextCallback) {
  onPageContext = cb;
}

export function getCurrentManifestVersion(): string {
  return currentManifestVersion;
}

function errorPayload(code: ErrorCode, message: string, detail?: any): BridgeError {
  const e: BridgeError = { code, message };
  if (detail !== undefined) e.detail = detail;
  return e;
}

export async function callParentHost(command: string, payload?: any): Promise<any> {
  const id = `host_${++counter}_${Date.now()}`;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, command });

    if (isStandalone) {
      executeMockCommand(command, payload ?? {})
        .then((result) => {
          pending.delete(id);
          resolve(result);
        })
        .catch((err) => {
          pending.delete(id);
          reject(err);
        });
    } else {
      const request: Message = {
        id,
        type: 'request',
        command,
        payload,
        timestamp: Date.now(),
      };

      window.parent.postMessage(request, PARENT_ORIGIN_DEFAULT);

      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          const err: any = new Error(`请求超时: ${command}`);
          err.code = ErrorCode.TIMEOUT;
          reject(err);
        }
      }, 30000);
    }
  });
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== PARENT_ORIGIN_DEFAULT && event.origin !== SELF_ORIGIN) return;

  const msg = event.data as Message;
  if (!msg || !msg.type) return;

  if (msg.type === 'response') {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);

    if (msg.error) {
      const err: any = new Error(msg.error.message);
      err.code = msg.error.code;
      err.detail = msg.error.detail;
      p.reject(err);
    } else {
      p.resolve(msg.payload);
    }
  } else if (msg.type === 'event') {
    if (msg.command === 'host_ready' && !handshakeSent) {
      handshakeSent = true;
      callParentHost('handshake', {}).catch(() => {});
    }
    if (msg.command === 'manifest_push' || msg.command === 'manifest_update') {
      currentManifestVersion = msg.payload?.manifest_version || msg.manifest_version || '';
      if (onPageContext && msg.payload?.page_metadata) {
        const meta = msg.payload.page_metadata;
        onPageContext({
          url: meta.url || '',
          title: meta.title || '',
          page_type: meta.page_type || '',
          tools: msg.payload.tools || [],
        });
      }
    } else if (msg.command === 'page_changed') {
      if (onPageContext && msg.payload) {
        onPageContext({
          url: msg.payload.new_url || '',
          title: '',
          page_type: '',
        });
      }
    }
    if (shellIframe) {
      shellIframe.contentWindow?.postMessage(msg, shellAppOrigin);
    }
  }
});

let shellLog: LogCallback | undefined;
let shellIframe: HTMLIFrameElement | null = null;
let shellAppOrigin: string = SELF_ORIGIN;

export function initShell(config: ShellConfig): void {
  shellLog = config.onLog;
  shellIframe = config.iframe;
  shellAppOrigin = config.appOrigin;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== config.iframe.contentWindow) return;
    if (event.origin !== config.appOrigin) return;

    const msg = event.data as Message;
    if (!msg) return;

    if (msg.type === 'request') {
      handleIframeRequest(msg);
    }
  });

  if (isStandalone) {
    currentManifestVersion = 'v1';
    setTimeout(() => {
      forwardEventToIframe({
        type: 'event',
        command: 'host_ready',
        payload: { protocol_version: '1.1', capability_version: '4.6' },
        timestamp: Date.now(),
      });
    }, 100);
    setTimeout(() => {
      const pushMsg: Message = {
        id: `evt_${Date.now()}`,
        type: 'event',
        command: 'manifest_push',
        payload: {
          manifest_version: 'v1',
          page_metadata: { url: 'https://github.com', title: 'GitHub', page_type: 'repository' },
          tools: [],
        },
        timestamp: Date.now(),
      };
      forwardEventToIframe(pushMsg);
    }, 200);
  }
}

function forwardEventToIframe(msg: Pick<Message, 'type' | 'command' | 'payload' | 'manifest_version'>): void {
  const fullMsg: Message = {
    id: `evt_${Date.now()}`,
    timestamp: Date.now(),
    ...msg,
  };

  shellLog?.({
    type: 'event',
    command: msg.command ?? 'unknown',
    payload: msg.payload,
    timestamp: Date.now(),
    source: 'parent',
  });

  shellIframe?.contentWindow?.postMessage(fullMsg, shellAppOrigin);
}

async function handleIframeRequest(msg: Message): Promise<void> {
  shellLog?.({
    type: 'request',
    command: msg.command ?? 'unknown',
    payload: msg.payload,
    timestamp: Date.now(),
    source: 'iframe',
  });

  try {
    const result = await callParentHost(msg.command ?? '', msg.payload);

    shellLog?.({
      type: 'response',
      command: msg.command ?? 'unknown',
      payload: result,
      timestamp: Date.now(),
      source: 'parent',
    });

    shellIframe?.contentWindow?.postMessage(
      {
        id: msg.id,
        type: 'response',
        command: msg.command,
        payload: result,
        timestamp: Date.now(),
      } satisfies Message,
      shellAppOrigin,
    );
  } catch (err: any) {
    const code = err.code ?? ErrorCode.EXEC_ERROR;
    const message = err.message ?? String(err);

    shellLog?.({
      type: 'error',
      command: msg.command ?? 'unknown',
      payload: { code, message },
      timestamp: Date.now(),
      source: 'parent',
    });

    shellIframe?.contentWindow?.postMessage(
      {
        id: msg.id,
        type: 'response',
        command: msg.command,
        error: errorPayload(code, message),
        timestamp: Date.now(),
      } satisfies Message,
      shellAppOrigin,
    );
  }
}

async function executeMockCommand(command: string, payload: any): Promise<any> {
  await randomDelay(50, 400);

  switch (command) {
    case 'ping':
      return { pong: true, timestamp: Date.now() };

    case 'handshake':
      return { accepted: true, protocol_version: '1.1', session_id: `sess_${Date.now()}` };

    case 'host_ready':
      return { protocol_version: '1.1', capability_version: '4.6' };

    case 'get_tabs':
      return {
        tabs: [
          { id: 1, title: 'Google', url: 'https://google.com', is_active: false, is_loading: false, hostname: 'google.com' },
          { id: 2, title: 'GitHub', url: 'https://github.com', is_active: true, is_loading: false, hostname: 'github.com' },
          { id: 3, title: 'Demo Page', url: 'http://localhost:8080', is_active: false, is_loading: false, hostname: 'localhost' },
        ],
      };

    case 'get_active_tab':
      return { id: 2, title: 'GitHub', url: 'https://github.com' };

    case 'switch_tab':
      return { success: true };

    case 'create_tab': {
      console.log(`[Mock] 创建标签页: ${payload.url || '(空)'}`);
      return { success: true, tab_id: 100 };
    }

    case 'close_tab':
      return { success: true };

    case 'navigate': {
      console.log(`[Mock] 导航到: ${payload.url}`);
      return { success: true, url: payload.url };
    }

    case 'scroll':
      return { success: true, scroll_x: payload.x ?? 0, scroll_y: payload.y ?? 0 };

    case 'wait':
      return { success: true, waited_ms: payload.timeout_ms ?? 0 };

    case 'get_screenshot':
      return {
        success: true,
        mime_type: 'image/jpeg',
        width: 1920,
        height: 1080,
        data_base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
      };

    case 'resolve_selector': {
      console.log(`[Mock] 解析选择器: ${payload.selector}`);
      const ref = `ref_${Date.now()}`;
      return {
        found: true,
        target_ref: ref,
        descriptor: {
          target_ref: ref,
          tag_name: 'div',
          is_visible: true,
          is_interactable: true,
          inner_text: 'Demo Element',
        },
      };
    }

    case 'query_target': {
      return {
        found: true,
        target_ref: payload.target_ref,
        descriptor: {
          target_ref: payload.target_ref,
          tag_name: 'div',
          is_visible: true,
          is_interactable: true,
        },
      };
    }

    case 'wait_for_element':
      return { success: true, found: true };

    case 'click_button': {
      if (payload.target_ref) {
        console.log(`[Mock] 点击: ${payload.target_ref}`);
        return { success: true, clicked: true };
      }
      return { success: true, clicked: true };
    }

    case 'input_text': {
      console.log(`[Mock] 输入文本: ${payload.target_ref || payload.selector} -> ${payload.text}`);
      return { success: true, filled: true };
    }

    case 'fill_field': {
      console.log(`[Mock] 填写字段: ${payload.field_name} -> ${payload.value}`);
      return { success: true, filled: true };
    }

    case 'hover': {
      return { success: true };
    }

    case 'screenshot_element': {
      return {
        success: true,
        mime_type: 'image/jpeg',
        width: 200,
        height: 100,
        data_base64: 'iVBORw0KGgoAAAANSUhEUgAA...',
      };
    }

    case 'scroll_into_view': {
      return { success: true };
    }

    case 'press_key': {
      console.log(`[Mock] 按键: ${payload.key}`);
      return { success: true };
    }

    case 'discover_tools': {
      return {
        manifest_version: 'v1',
        page_metadata: {
          url: 'https://demo.example.com',
          title: 'Demo Page',
          page_type: 'demo',
        },
        tools: [],
      };
    }

    case 'search': {
      console.log(`[Mock] 搜索: ${payload.query}`);
      return { success: true, submitted: true };
    }

    case 'login': {
      return { success: true, logged_in: true };
    }

    case 'fill_form': {
      return { success: true, fields_filled: payload.fields?.length ?? 0 };
    }

    case 'filter_select': {
      return { success: true, selected: true };
    }

    case 'paginate': {
      return { success: true, current_page: 1 };
    }

    case 'extract_list': {
      return { success: true, items: [], count: 0 };
    }

    case 'evaluate_js': {
      return { success: true, result: 'mock result' };
    }

    case 'execute_step': {
      console.log(`[Mock] 执行步骤: ${payload.command}`);
      return {
        success: true,
        result: {},
        manifest_version: 'v1',
        command: payload.command,
      };
    }

    case 'execute_plan': {
      console.log(`[Mock] 执行计划: ${payload.steps?.length ?? 0} 步`);
      return {
        overall_success: true,
        steps_completed: payload.steps?.length ?? 0,
        steps_total: payload.steps?.length ?? 0,
        results: (payload.steps ?? []).map((_: any, i: number) => ({
          step_index: i,
          command: payload.steps[i]?.command ?? 'unknown',
          success: true,
          duration_ms: 100,
        })),
        total_duration_ms: (payload.steps?.length ?? 0) * 100,
      };
    }

    case 'close_popup': {
      console.log('[Mock] 关闭弹窗');
      return { success: true };
    }

    default:
      throw Object.assign(
        new Error(`未知命令: ${command}`),
        { code: ErrorCode.INVALID_COMMAND },
      );
  }
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}
