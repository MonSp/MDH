import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc-handlers.js';

// ─── 环境检测 ───
const isDev = !app.isPackaged;

// ─── 窗口创建 ───
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'MDH - 大荒界',
    icon: join(__dirname, '../public/favicon.svg'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // 需要 child_process 执行本地工具
    },
  });

  if (isDev) {
    const port = process.env.VITE_PORT || '8080';
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── 加载 LLM 配置 ───
function loadLlmConfig() {
  // 优先从环境变量读取
  return {
    provider: process.env.LLM_PROVIDER || process.env.DEEPSEEK_PROVIDER || 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || process.env.LLM_BASE_URL || '',
    model: process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL || '',
  };
}

// ─── 应用生命周期 ───
app.whenReady().then(async () => {
  const llmConfig = loadLlmConfig();

  // 注册 IPC 处理器（桥接前端 ↔ Orchestrator）
  registerIpcHandlers(llmConfig);

  // 创建窗口
  createWindow();

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── 安全：限制新窗口创建 ───
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
