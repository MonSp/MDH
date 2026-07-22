import { app, BrowserWindow, shell, dialog } from 'electron';
import { join, extname } from 'path';
import { existsSync } from 'fs';
import { registerIpcHandlers, notifyRenderer } from './ipc-handlers.js';

// ─── 环境检测 ───
const isDev = !app.isPackaged;

// ─── 平台特定图标 ───
function getIconPath(): string | undefined {
  const iconName = process.platform === 'win32' ? 'favicon.ico' : 'favicon.svg';
  const iconPath = join(__dirname, '../public', iconName);
  return existsSync(iconPath) ? iconPath : undefined;
}

// ─── 自动更新 ───
// electron-updater 在打包后才可用，开发模式下跳过
let autoUpdater: any = null;

async function setupAutoUpdater() {
  if (isDev) return;

  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;

    // 配置更新源
    autoUpdater.autoDownload = false; // 手动确认下载
    autoUpdater.autoInstallOnAppQuit = true;

    // 检查更新
    autoUpdater.on('checking-for-update', () => {
      notifyRenderer('mdh:onUpdateStatus', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info: any) => {
      notifyRenderer('mdh:onUpdateStatus', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', () => {
      notifyRenderer('mdh:onUpdateStatus', { status: 'not-available' });
    });

    autoUpdater.on('download-progress', (progress: any) => {
      notifyRenderer('mdh:onUpdateStatus', {
        status: 'downloading',
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      notifyRenderer('mdh:onUpdateStatus', {
        status: 'downloaded',
        version: info.version,
      });
    });

    autoUpdater.on('error', (err: Error) => {
      notifyRenderer('mdh:onUpdateStatus', {
        status: 'error',
        message: err.message,
      });
    });

    // 启动后延迟检查更新（不阻塞启动）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  } catch {
    // electron-updater 未安装（开发模式），忽略
  }
}

// ─── 窗口创建 ───
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'MDH - 大荒界',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── 加载 LLM 配置 ───
function loadLlmConfig() {
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

  // 注册 IPC 处理器（异步加载 orchestrator 模块）
  await registerIpcHandlers(llmConfig);

  // 创建窗口
  createWindow();

  // 设置自动更新
  await setupAutoUpdater();

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
