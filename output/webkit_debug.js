const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const { webkit } = require('@playwright/test');

const cwd = '/home/surya/roomshare';
const port = 3112;
const baseURL = `http://127.0.0.1:${port}`;

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('server did not start'));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

(async () => {
  const server = spawn('pnpm', ['run', 'start', '--port', String(port)], {
    cwd,
    env: { ...process.env, ENABLE_SEARCH_TEST_SCENARIOS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(String(d)));
  server.stderr.on('data', (d) => process.stderr.write(String(d)));

  try {
    await waitForServer(baseURL + '/api/health/live');
    const browser = await webkit.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: { 'x-e2e-search-scenario': 'default-results' },
    });
    const page = await context.newPage();
    const requests = [];
    page.on('requestfailed', (req) => requests.push({ url: req.url(), failure: req.failure() }));
    page.on('console', (msg) => console.log('console', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('pageerror', err.message));

    await page.goto(baseURL + '/search?where=Austin&lat=30.2672&lng=-97.7431', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets).map((sheet) => ({
        href: sheet.href,
        disabled: sheet.disabled,
        rules: (() => { try { return sheet.cssRules?.length ?? null; } catch { return 'inaccessible'; } })(),
      }));
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => ({ href: link.href }));
      const mobileNav = document.querySelector('[aria-label="Mobile navigation"]');
      const mobileNavStyle = mobileNav ? getComputedStyle(mobileNav) : null;
      const collapsed = document.querySelector('[aria-label="Expand search"]');
      const collapsedStyle = collapsed ? getComputedStyle(collapsed) : null;
      const desktopSummary = document.querySelector('[data-testid="desktop-header-search-summary"]');
      const desktopSummaryStyle = desktopSummary ? getComputedStyle(desktopSummary) : null;
      return {
        innerWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio,
        matchDesktop: window.matchMedia('(min-width: 768px)').matches,
        stylesheets,
        links,
        mobileNav: mobileNav ? {
          display: mobileNavStyle.display,
          visibility: mobileNavStyle.visibility,
          position: mobileNavStyle.position,
          rect: mobileNav.getBoundingClientRect().toJSON(),
        } : null,
        collapsed: collapsed ? {
          display: collapsedStyle.display,
          visibility: collapsedStyle.visibility,
          rect: collapsed.getBoundingClientRect().toJSON(),
        } : null,
        desktopSummary: desktopSummary ? {
          display: desktopSummaryStyle.display,
          visibility: desktopSummaryStyle.visibility,
          rect: desktopSummary.getBoundingClientRect().toJSON(),
        } : null,
      };
    });

    console.log(JSON.stringify(info, null, 2));
    console.log('failedRequests', JSON.stringify(requests, null, 2));
    await page.screenshot({ path: path.join(cwd, 'output', 'webkit-search-debug.png'), fullPage: true });
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
