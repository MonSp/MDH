/**
 * Playwright 浏览器自动化集成测试
 *
 * 使用本地 HTML 文件测试完整的浏览器工具流程。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PlaywrightBrowser } from '../browser.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_PAGES_DIR = resolve(__dirname, '../test-pages');
const TEST_PAGE_URL = `file://${TEST_PAGES_DIR}/index.html`;
const PAGE2_URL = `file://${TEST_PAGES_DIR}/page2.html`;

describe('PlaywrightBrowser Integration Tests', () => {
  let browser: PlaywrightBrowser;
  let playwrightAvailable = false;

  beforeAll(async () => {
    browser = new PlaywrightBrowser({ headless: true });
    try {
      await browser.initialize();
      playwrightAvailable = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Executable doesn't exist") || msg.includes('browserType.launch')) {
        console.warn('Playwright browsers not installed, skipping integration tests. Run: npx playwright install chromium');
        return;
      }
      throw e;
    }
  });

  afterAll(async () => {
    if (playwrightAvailable) {
      await browser.close();
    }
  });

  // Helper to skip tests when Playwright is not available
  function requirePlaywright() {
    if (!playwrightAvailable) {
      // Skip test silently
      return false;
    }
    return true;
  }

  // ── 导航工具 ──

  describe('Navigation', () => {
    it('should navigate to a URL', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.navigate(TEST_PAGE_URL);
      expect(result.url).toContain('index.html');
      expect(result.title).toBe('MDH Browser Test Page');
    });

    it('should get current URL', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.getUrl();
      expect(result.url).toContain('index.html');
    });

    it('should get page title', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.getTitle();
      expect(result.title).toBe('MDH Browser Test Page');
    });

    it('should navigate to page 2 and back', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(PAGE2_URL);
      const result = await browser.getTitle();
      expect(result.title).toBe('Page 2 - MDH Test');

      await browser.goBack();
      const backResult = await browser.getTitle();
      expect(backResult.title).toBe('MDH Browser Test Page');
    });

    it('should reload page', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.reload();
      expect(result.title).toBe('MDH Browser Test Page');
    });
  });

  // ── 查询工具 ──

  describe('Query Tools', () => {
    it('should get text from element', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      const result = await browser.getText('#title');
      expect(result.text).toBe('MDH Browser Automation Test');
    });

    it('should get attribute from element', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.getAttribute('#link-page2', 'href');
      expect(result.value).toBe('page2.html');
    });

    it('should query element existence', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.query('#title');
      expect(result.exists).toBe(true);
      expect(result.tag).toBe('h1');
      expect(result.visible).toBe(true);
    });

    it('should query non-existent element', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.query('#non-existent');
      expect(result.exists).toBe(false);
    });

    it('should wait for element', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.waitFor('#title', 'visible');
      expect(result.success).toBe(true);
    });

    it('should wait for hidden element to become visible', async () => {
      if (!requirePlaywright()) return;
      // The hidden element starts with class="hidden"
      const result = await browser.waitFor('#hidden-element', 'hidden');
      expect(result.success).toBe(true);
    });
  });

  // ── 交互工具 ──

  describe('Interaction Tools', () => {
    it('should click button and trigger action', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      await browser.click('#increment-btn');
      const result = await browser.getText('#counter');
      expect(result.text).toBe('1');
    });

    it('should click multiple times', async () => {
      if (!requirePlaywright()) return;
      await browser.click('#increment-btn');
      await browser.click('#increment-btn');
      await browser.click('#increment-btn');
      const result = await browser.getText('#counter');
      expect(result.text).toBe('4');
    });

    it('should fill input field', async () => {
      if (!requirePlaywright()) return;
      await browser.fill('#name', 'John Doe');
      const result = await browser.getAttribute('#name', 'value');
      expect(result.value).toBe('John Doe');
    });

    it('should type text with delay', async () => {
      if (!requirePlaywright()) return;
      await browser.fill('#email', '');
      await browser.typeText('#email', 'test@example.com', 10);
      const result = await browser.getAttribute('#email', 'value');
      expect(result.value).toBe('test@example.com');
    });

    it('should select dropdown option', async () => {
      if (!requirePlaywright()) return;
      await browser.select('#role', 'developer');
      const result = await browser.getAttribute('#role', 'value');
      expect(result.value).toBe('developer');
    });

    it('should submit form and see result', async () => {
      if (!requirePlaywright()) return;
      await browser.click('#submit-btn');
      const result = await browser.getText('#result');
      expect(result.text).toContain('John Doe');
      expect(result.text).toContain('test@example.com');
      expect(result.text).toContain('developer');
    });

    it('should hover on element', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.hover('#title');
      expect(result.success).toBe(true);
    });

    it('should press keyboard key', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.pressKey('Tab');
      expect(result.success).toBe(true);
    });

    it('should scroll page', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.scroll('down', 300);
      expect(result.success).toBe(true);
    });

    it('should show hidden element via click', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      await browser.click('#show-btn');
      const result = await browser.query('#hidden-element');
      expect(result.visible).toBe(true);
    });
  });

  // ── 标签页工具 ──

  describe('Tab Management', () => {
    it('should list tabs', async () => {
      if (!requirePlaywright()) return;
      const tabs = await browser.listTabs();
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs[0].active).toBe(true);
    });

    it('should create new tab', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.newTab(PAGE2_URL);
      expect(result.tabId).toBeDefined();
      expect(result.url).toContain('page2.html');
    });

    it('should switch between tabs', async () => {
      if (!requirePlaywright()) return;
      const tabs = await browser.listTabs();
      expect(tabs.length).toBe(2);

      await browser.switchTab(tabs[0].id);
      const activeTabs = await browser.listTabs();
      expect(activeTabs[0].active).toBe(true);
    });

    it('should close tab', async () => {
      if (!requirePlaywright()) return;
      const tabsBefore = await browser.listTabs();
      await browser.closeTab(tabsBefore[tabsBefore.length - 1].id);
      const tabsAfter = await browser.listTabs();
      expect(tabsAfter.length).toBe(tabsBefore.length - 1);
    });
  });

  // ── 截图工具 ──

  describe('Screenshots', () => {
    it('should take full page screenshot', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      const result = await browser.screenshot();
      expect(result.base64).toBeDefined();
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.path).toContain('.png');
    });

    it('should take element screenshot', async () => {
      if (!requirePlaywright()) return;
      const result = await browser.screenshotElement('#title');
      expect(result.base64).toBeDefined();
      expect(result.base64.length).toBeGreaterThan(0);
    });

    it('should throw on non-existent element screenshot', async () => {
      if (!requirePlaywright()) return;
      await expect(browser.screenshotElement('#non-existent')).rejects.toThrow();
    });
  });

  // ── 高级工具 ──

  describe('Advanced Tools', () => {
    it('should execute JavaScript', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      const result = await browser.evaluateJs('document.title');
      expect(result.result).toBe('MDH Browser Test Page');
    });

    it('should execute JavaScript that modifies page', async () => {
      if (!requirePlaywright()) return;
      await browser.evaluateJs('document.getElementById("counter").textContent = "999"');
      const result = await browser.getText('#counter');
      expect(result.text).toBe('999');
    });

    it('should execute steps batch', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      const results = await browser.executeSteps([
        { action: 'fill', selector: '#name', value: 'Test User' },
        { action: 'fill', selector: '#email', value: 'test@test.com' },
        { action: 'click', selector: '#submit-btn' },
      ]);
      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);

      const result = await browser.getText('#result');
      expect(result.text).toContain('Test User');
    });

    it('should handle step failure gracefully', async () => {
      if (!requirePlaywright()) return;
      await browser.navigate(TEST_PAGE_URL);
      const results = await browser.executeSteps([
        { action: 'click', selector: '#non-existent' },
        { action: 'fill', selector: '#name', value: 'should not fail' },
      ]);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  // ── 完整流程测试 ──

  describe('Full Workflow', () => {
    it('should complete a full form submission workflow', async () => {
      if (!requirePlaywright()) return;
      // 1. Navigate to test page
      await browser.navigate(TEST_PAGE_URL);
      const title = await browser.getTitle();
      expect(title.title).toBe('MDH Browser Test Page');

      // 2. Fill form
      await browser.fill('#name', 'Alice Smith');
      await browser.fill('#email', 'alice@example.com');
      await browser.select('#role', 'designer');

      // 3. Submit
      await browser.click('#submit-btn');

      // 4. Verify result
      const result = await browser.getText('#result');
      expect(result.text).toContain('Alice Smith');
      expect(result.text).toContain('alice@example.com');
      expect(result.text).toContain('designer');

      // 5. Take screenshot as evidence
      const screenshot = await browser.screenshot();
      expect(screenshot.base64.length).toBeGreaterThan(0);
    });
  });
});
