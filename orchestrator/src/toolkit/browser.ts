/**
 * Playwright 浏览器自动化 — 增强版
 *
 * 支持有头/无头模式、浏览器扩展加载、录制回放、HITL 集成。
 * 提供 25 个浏览器工具 + 增强功能。
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

export interface HITLConfig {
  /** 是否启用 HITL 确认 */
  enabled: boolean;
  /** 导航白名单（不需要确认的域名） */
  navigationWhitelist: string[];
  /** 需要确认的操作类型 */
  confirmActions: Array<'navigate' | 'fill' | 'click_submit' | 'evaluate_js'>;
  /** 敏感字段选择器（fill 操作需要确认） */
  sensitiveSelectors: string[];
  /** 确认超时（毫秒，默认 30s） */
  confirmTimeout: number;
}

export interface BrowserConfig {
  headless: boolean;
  browser: 'chromium' | 'firefox' | 'webkit';
  timeout: number;
  screenshotDir: string;
  extensions: string[];
  recordingDir: string;
  slowMo: number;
  hitl: HITLConfig;
}

export type ConfirmCallback = (action: string, details: string) => Promise<boolean>;

const DEFAULT_HITL_CONFIG: HITLConfig = {
  enabled: false,
  navigationWhitelist: ['localhost', '127.0.0.1', 'github.com'],
  confirmActions: ['navigate', 'click_submit', 'evaluate_js'],
  sensitiveSelectors: ['input[type="password"]', 'input[type="credit-card"]', '[data-sensitive]'],
  confirmTimeout: 30000,
};

const DEFAULT_CONFIG: BrowserConfig = {
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  browser: (process.env.PLAYWRIGHT_BROWSER as any) || 'chromium',
  timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000'),
  screenshotDir: process.env.PLAYWRIGHT_SCREENSHOT_DIR || '/tmp/screenshots',
  extensions: process.env.PLAYWRIGHT_EXTENSIONS?.split(',') || [],
  recordingDir: process.env.PLAYWRIGHT_RECORDING_DIR || '/tmp/recordings',
  slowMo: parseInt(process.env.PLAYWRIGHT_SLOW_MO || '0'),
  hitl: DEFAULT_HITL_CONFIG,
};

export interface RecordingEntry {
  timestamp: number;
  action: string;
  selector?: string;
  value?: string;
  url?: string;
}

export class PlaywrightBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private activePageId: string = '';
  private config: BrowserConfig;
  private initialized = false;
  private recording: RecordingEntry[] = [];
  private isRecording = false;
  private confirmCallback: ConfirmCallback | null = null;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 设置 HITL 确认回调 */
  setConfirmCallback(callback: ConfirmCallback): void {
    this.confirmCallback = callback;
  }

  /** 请求 HITL 确认 */
  private async requestConfirmation(action: string, details: string): Promise<boolean> {
    if (!this.config.hitl.enabled || !this.confirmCallback) {
      return true; // 未启用 HITL，自动通过
    }
    return this.confirmCallback(action, details);
  }

  /** 检查 URL 是否在白名单中 */
  private isWhitelistedUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.config.hitl.navigationWhitelist.some(
        pattern => hostname === pattern || hostname.endsWith('.' + pattern)
      );
    } catch {
      return false;
    }
  }

  /** 检查选择器是否为敏感字段 */
  private isSensitiveSelector(selector: string): boolean {
    return this.config.hitl.sensitiveSelectors.some(
      pattern => selector.includes(pattern) || selector.match(new RegExp(pattern))
    );
  }

  /** 初始化浏览器 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const launchOptions: Record<string, unknown> = {
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    };

    // 加载浏览器扩展（仅有头模式支持）
    if (this.config.extensions.length > 0 && !this.config.headless) {
      launchOptions.args = this.config.extensions.map(ext => `--load-extension=${ext}`);
      launchOptions.args.push('--disable-extensions-except=' + this.config.extensions.join(','));
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: this.isRecording ? { dir: this.config.recordingDir } : undefined,
    });
    this.context.setDefaultTimeout(this.config.timeout);

    // 创建默认标签页
    const page = await this.context.newPage();
    const tabId = 'tab-1';
    this.pages.set(tabId, page);
    this.activePageId = tabId;

    // 确保目录存在
    if (!existsSync(this.config.screenshotDir)) {
      mkdirSync(this.config.screenshotDir, { recursive: true });
    }
    if (!existsSync(this.config.recordingDir)) {
      mkdirSync(this.config.recordingDir, { recursive: true });
    }

    this.initialized = true;
  }

  /** 关闭浏览器 */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.pages.clear();
      this.activePageId = '';
      this.initialized = false;
    }
  }

  /** 获取当前活跃页面 */
  private getActivePage(): Page {
    const page = this.pages.get(this.activePageId);
    if (!page) throw new Error('No active page');
    return page;
  }

  /** 确保浏览器已初始化 */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /** 记录操作 */
  private record(entry: RecordingEntry): void {
    if (this.isRecording) {
      this.recording.push(entry);
    }
  }

  // ── 录制控制 ──

  startRecording(): void {
    this.isRecording = true;
    this.recording = [];
  }

  stopRecording(): RecordingEntry[] {
    this.isRecording = false;
    return [...this.recording];
  }

  saveRecording(path: string): void {
    writeFileSync(path, JSON.stringify(this.recording, null, 2));
  }

  loadRecording(path: string): RecordingEntry[] {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data);
  }

  async replayRecording(entries: RecordingEntry[]): Promise<void> {
    for (const entry of entries) {
      switch (entry.action) {
        case 'navigate':
          await this.navigate(entry.url!);
          break;
        case 'click':
          await this.click(entry.selector!);
          break;
        case 'fill':
          await this.fill(entry.selector!, entry.value!);
          break;
        case 'type':
          await this.typeText(entry.selector!, entry.value!);
          break;
        case 'press':
          await this.pressKey(entry.value!);
          break;
        case 'wait':
          await new Promise(r => setTimeout(r, parseInt(entry.value || '1000')));
          break;
      }
    }
  }

  // ── 导航工具 ──

  async navigate(url: string): Promise<{ url: string; title: string }> {
    await this.ensureInitialized();

    // HITL: 非白名单域名需要确认
    if (!this.isWhitelistedUrl(url)) {
      const confirmed = await this.requestConfirmation('navigate', `导航到 ${url}`);
      if (!confirmed) {
        throw new Error(`用户拒绝导航到: ${url}`);
      }
    }

    const page = this.getActivePage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    this.record({ timestamp: Date.now(), action: 'navigate', url });
    return { url: page.url(), title: await page.title() };
  }

  async goBack(): Promise<{ url: string; title: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.goBack();
    return { url: page.url(), title: await page.title() };
  }

  async goForward(): Promise<{ url: string; title: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.goForward();
    return { url: page.url(), title: await page.title() };
  }

  async reload(): Promise<{ url: string; title: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.reload();
    return { url: page.url(), title: await page.title() };
  }

  // ── 交互工具 ──

  async click(selector: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.click(selector);
    this.record({ timestamp: Date.now(), action: 'click', selector });
    return { success: true };
  }

  async fill(selector: string, value: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();

    // HITL: 敏感字段需要确认
    if (this.isSensitiveSelector(selector)) {
      const confirmed = await this.requestConfirmation('fill', `填写敏感字段: ${selector}`);
      if (!confirmed) {
        throw new Error(`用户拒绝填写敏感字段: ${selector}`);
      }
    }

    const page = this.getActivePage();
    await page.fill(selector, value);
    this.record({ timestamp: Date.now(), action: 'fill', selector, value });
    return { success: true };
  }

  async typeText(selector: string, text: string, delay?: number): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.type(selector, text, { delay: delay ?? 50 });
    this.record({ timestamp: Date.now(), action: 'type', selector, value: text });
    return { success: true };
  }

  async pressKey(key: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.keyboard.press(key);
    this.record({ timestamp: Date.now(), action: 'press', value: key });
    return { success: true };
  }

  async hover(selector: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.hover(selector);
    this.record({ timestamp: Date.now(), action: 'hover', selector });
    return { success: true };
  }

  async select(selector: string, value: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.selectOption(selector, value);
    return { success: true };
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const scrollAmount = amount ?? 500;
    const delta = direction === 'up' || direction === 'left' ? -scrollAmount : scrollAmount;
    const x = direction === 'left' || direction === 'right' ? delta : 0;
    const y = direction === 'up' || direction === 'down' ? delta : 0;
    await page.mouse.wheel(x, y);
    return { success: true };
  }

  // ── 查询工具 ──

  async getText(selector: string): Promise<{ text: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const text = await page.textContent(selector);
    return { text: text?.trim() || '' };
  }

  async getAttribute(selector: string, attribute: string): Promise<{ value: string | null }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const value = await page.getAttribute(selector, attribute);
    return { value };
  }

  async getUrl(): Promise<{ url: string }> {
    await this.ensureInitialized();
    return { url: this.getActivePage().url() };
  }

  async getTitle(): Promise<{ title: string }> {
    await this.ensureInitialized();
    const title = await this.getActivePage().title();
    return { title };
  }

  async query(selector: string): Promise<{ exists: boolean; text?: string; tag?: string; visible?: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const element = await page.$(selector);
    if (!element) return { exists: false };
    const text = await element.textContent();
    const tag = await element.evaluate(el => el.tagName.toLowerCase());
    const visible = await element.isVisible();
    return { exists: true, text: text?.trim(), tag, visible };
  }

  async waitFor(selector: string, state: 'visible' | 'hidden' | 'attached' = 'visible'): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.waitForSelector(selector, { state });
    return { success: true };
  }

  // ── 截图工具 ──

  async screenshot(path?: string): Promise<{ path: string; base64: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const screenshotPath = path || join(this.config.screenshotDir, `screenshot-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const buffer = await page.screenshot({ fullPage: true });
    return { path: screenshotPath, base64: buffer.toString('base64') };
  }

  async screenshotElement(selector: string, path?: string): Promise<{ path: string; base64: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    const element = await page.$(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    const screenshotPath = path || join(this.config.screenshotDir, `element-${Date.now()}.png`);
    await element.screenshot({ path: screenshotPath });
    const buffer = await element.screenshot();
    return { path: screenshotPath, base64: buffer.toString('base64') };
  }

  // ── 标签页工具 ──

  async listTabs(): Promise<Array<{ id: string; url: string; title: string; active: boolean }>> {
    await this.ensureInitialized();
    const tabs: Array<{ id: string; url: string; title: string; active: boolean }> = [];
    for (const [id, page] of this.pages) {
      tabs.push({
        id,
        url: page.url(),
        title: await page.title(),
        active: id === this.activePageId,
      });
    }
    return tabs;
  }

  async switchTab(tabId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    if (!this.pages.has(tabId)) throw new Error(`Tab not found: ${tabId}`);
    this.activePageId = tabId;
    return { success: true };
  }

  async newTab(url?: string): Promise<{ tabId: string; url: string }> {
    await this.ensureInitialized();
    const page = await this.context!.newPage();
    const tabId = `tab-${this.pages.size + 1}`;
    this.pages.set(tabId, page);
    this.activePageId = tabId;
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
    return { tabId, url: page.url() };
  }

  async closeTab(tabId: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.pages.get(tabId);
    if (!page) throw new Error(`Tab not found: ${tabId}`);
    await page.close();
    this.pages.delete(tabId);
    if (this.activePageId === tabId) {
      const remaining = Array.from(this.pages.keys());
      this.activePageId = remaining[0] || '';
    }
    return { success: true };
  }

  // ── 高级工具 ──

  async evaluateJs(code: string): Promise<{ result: unknown }> {
    await this.ensureInitialized();

    // HITL: JS 执行需要确认
    const confirmed = await this.requestConfirmation('evaluate_js', `执行 JS: ${code.substring(0, 100)}...`);
    if (!confirmed) {
      throw new Error('用户拒绝执行 JavaScript');
    }

    const page = this.getActivePage();
    const result = await page.evaluate(code);
    return { result };
  }

  async executeSteps(steps: Array<{ action: string; selector?: string; value?: string; key?: string }>): Promise<Array<{ action: string; success: boolean; result?: unknown }>> {
    await this.ensureInitialized();
    const results: Array<{ action: string; success: boolean; result?: unknown }> = [];
    for (const step of steps) {
      try {
        let result: unknown;
        switch (step.action) {
          case 'navigate': result = await this.navigate(step.value!); break;
          case 'click': result = await this.click(step.selector!); break;
          case 'fill': result = await this.fill(step.selector!, step.value!); break;
          case 'type': result = await this.typeText(step.selector!, step.value!); break;
          case 'press': result = await this.pressKey(step.key!); break;
          case 'hover': result = await this.hover(step.selector!); break;
          case 'wait': await new Promise(r => setTimeout(r, parseInt(step.value || '1000'))); result = { success: true }; break;
          default: throw new Error(`Unknown step action: ${step.action}`);
        }
        results.push({ action: step.action, success: true, result });
      } catch (e: unknown) {
        results.push({ action: step.action, success: false, result: { error: e instanceof Error ? e.message : String(e) } });
      }
    }
    return results;
  }
}
