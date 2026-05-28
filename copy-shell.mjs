import fs from 'fs';
import path from 'path';

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plugin Shell</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-deep: #06080e;
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-muted: rgba(255, 255, 255, 0.09);
    --accent-blue: #3399ff;
    --accent-green: #33cc66;
    --text-primary: #d4d8e0;
    --text-secondary: #6b7288;
    --text-muted: #3d4258;
    --font-mono: 'JetBrains Mono', monospace;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: var(--font-sans); background: var(--bg-deep); color: var(--text-primary); overflow: hidden; }
  .app { display: flex; flex-direction: column; height: 100vh; width: 100vw; }
  .status-bar { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; height:36px; padding:0 16px; background:rgba(10,14,22,0.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--border-subtle); z-index:10; }
  .status-left { display:flex; align-items:center; gap:10px; }
  .status-dot { width:7px; height:7px; border-radius:50%; background:var(--accent-green); box-shadow:0 0 6px rgba(51,204,102,0.4); flex-shrink:0; }
  .status-label { font-family:var(--font-mono); font-size:0.6rem; font-weight:500; letter-spacing:1.2px; color:var(--text-secondary); text-transform:uppercase; }
  .status-label span { color:var(--accent-blue); }
  .status-right { display:flex; align-items:center; gap:16px; }
  .test-link { font-family:var(--font-mono); font-size:0.55rem; font-weight:500; letter-spacing:0.8px; color:var(--text-muted); text-decoration:none; padding:3px 10px; border-radius:4px; border:1px solid transparent; transition:all 0.2s; }
  .test-link:hover { border-color:var(--border-muted); color:var(--text-secondary); background:rgba(255,255,255,0.03); }
  .iframe-container { flex:1; position:relative; background:#04060a; overflow:hidden; }
  .iframe-container iframe { width:100%; height:100%; border:none; display:block; }
  .iframe-container::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(51,153,255,0.15),transparent); pointer-events:none; z-index:2; }
</style>
</head>
<body>
<div class="app">
  <div class="status-bar">
    <div class="status-left">
      <div class="status-dot"></div>
      <div class="status-label">Plugin <span>Shell</span></div>
    </div>
    <div class="status-right">
      <a href="test.html" class="test-link">测试面板</a>
    </div>
  </div>
  <div class="iframe-container">
    <iframe id="companyIframe" src="company-app.html"></iframe>
  </div>
</div>
<script type="module">
import { initShell } from './plugin-shell.js';
var iframe = document.getElementById('companyIframe');
var origin = window.location.origin;
initShell({ iframe: iframe, appOrigin: origin, parentOrigin: 'chrome://ai-automation-side-panel.top-chrome' });
</script>
</body>
</html>`;

const outDir = path.resolve('dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('dist/index.html written');
