/**
 * Playwright 浏览器自动化
 *
 * 管理 Playwright 浏览器实例的生命周期，提供 25 个浏览器工具。
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface BrowserConfig {
  headless: boolean;
  browser: 'chromium' | 'firefox' | 'webkit';
  timeout: number;
  screenshotDir: string;
}

const DEFAULT_CONFIG: BrowserConfig = {
  headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  browser: (process.env.PLAYWRIGHT_BROWSER as any) || 'chromium',
  timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000'),
  screenshotDir: process.env.PLAYWRIGHT_SCREENSHOT_DIR || '/tmp/screenshots',
};

export class PlaywrightBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private activePageId: string = '';
  private config: BrowserConfig;
  private initialized = false;

  constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 初始化浏览器 */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    this.context.setDefaultTimeout(this.config.timeout);

    // 创建默认标签页
    const page = await this.context.newPage();
    const tabId = 'tab-1';
    this.pages.set(tabId, page);
    this.activePageId = tabId;

    // 确保截图目录存在
    if (!existsSync(this.config.screenshotDir)) {
      mkdirSync(this.config.screenshotDir, { recursive: true });
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

  // ── 导航工具 ──

  async navigate(url: string): Promise<{ url: string; title: string }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
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
    return { success: true };
  }

  async fill(selector: string, value: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.fill(selector, value);
    return { success: true };
  }

  async typeText(selector: string, text: string, delay?: number): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.type(selector, text, { delay: delay ?? 50 });
    return { success: true };
  }

  async pressKey(key: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.keyboard.press(key);
    return { success: true };
  }

  async hover(selector: string): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const page = this.getActivePage();
    await page.hover(selector);
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
