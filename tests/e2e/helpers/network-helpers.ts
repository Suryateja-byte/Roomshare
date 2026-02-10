import { Page, BrowserContext, Route, Request } from '@playwright/test';

/**
 * Network condition presets
 */
export type NetworkCondition =
  | 'fast'
  | 'slow-3g'
  | 'slow-4g'
  | 'offline'
  | 'flaky'
  | 'high-latency';

/**
 * Network condition configurations
 */
const networkConfigs: Record<
  NetworkCondition,
  { downloadSpeed?: number; uploadSpeed?: number; latency?: number; offline?: boolean }
> = {
  fast: { downloadSpeed: 10000000, uploadSpeed: 5000000, latency: 20 },
  'slow-3g': { downloadSpeed: 400000, uploadSpeed: 200000, latency: 400 },
  'slow-4g': { downloadSpeed: 2000000, uploadSpeed: 1000000, latency: 100 },
  offline: { offline: true },
  flaky: { downloadSpeed: 500000, uploadSpeed: 250000, latency: 500 },
  'high-latency': { downloadSpeed: 5000000, uploadSpeed: 2500000, latency: 1000 },
};

/**
 * Network helper factory
 */
export function networkHelpers(page: Page, context: BrowserContext) {
  let isOffline = false;
  let abortedRequests: string[] = [];

  return {
    /**
     * Set network condition preset
     */
    async setCondition(condition: NetworkCondition) {
      const config = networkConfigs[condition];

      if (config.offline) {
        await context.setOffline(true);
        isOffline = true;
      } else {
        await context.setOffline(false);
        isOffline = false;

        // CDP throttling only works in Chromium
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: (config.downloadSpeed || 5000000) / 8,
          uploadThroughput: (config.uploadSpeed || 2500000) / 8,
          latency: config.latency || 0,
        });
      }
    },

    /**
     * Reset to normal network conditions
     */
    async reset() {
      await context.setOffline(false);
      isOffline = false;

      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0,
        });
      } catch {
        // CDP not available in non-Chromium browsers
      }
    },

    /**
     * Go offline
     */
    async goOffline() {
      await context.setOffline(true);
      isOffline = true;
    },

    /**
     * Go online
     */
    async goOnline() {
      await context.setOffline(false);
      isOffline = false;
    },

    /**
     * Check if currently offline
     */
    isOffline(): boolean {
      return isOffline;
    },

    /**
     * Simulate flaky connection (random failures)
     */
    async simulateFlaky(failureRate = 0.3) {
      await page.route('**/*', async (route: Route) => {
        if (Math.random() < failureRate) {
          await route.abort('failed');
          abortedRequests.push(route.request().url());
        } else {
          await route.continue();
        }
      });
    },

    /**
     * Add latency to all requests
     */
    async addLatency(ms: number) {
      await page.route('**/*', async (route: Route) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        await route.continue();
      });
    },

    /**
     * Block specific URLs or patterns
     */
    async blockUrls(patterns: (string | RegExp)[]) {
      for (const pattern of patterns) {
        await page.route(pattern, (route: Route) => route.abort('blockedbyclient'));
      }
    },

    /**
     * Block all images
     */
    async blockImages() {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route: Route) =>
        route.abort('blockedbyclient')
      );
    },

    /**
     * Block all API calls
     */
    async blockApi() {
      await page.route('**/api/**', (route: Route) => route.abort('blockedbyclient'));
    },

    /**
     * Mock API response
     */
    async mockApiResponse(
      urlPattern: string | RegExp,
      response: {
        status?: number;
        body?: unknown;
        contentType?: string;
      }
    ) {
      await page.route(urlPattern, async (route: Route) => {
        await route.fulfill({
          status: response.status || 200,
          contentType: response.contentType || 'application/json',
          body:
            typeof response.body === 'string'
              ? response.body
              : JSON.stringify(response.body),
        });
      });
    },

    /**
     * Delay specific API calls
     */
    async delayApi(urlPattern: string | RegExp, delayMs: number) {
      await page.route(urlPattern, async (route: Route) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.continue();
      });
    },

    /**
     * Force API to return error
     */
    async forceApiError(urlPattern: string | RegExp, statusCode = 500) {
      await page.route(urlPattern, async (route: Route) => {
        await route.fulfill({
          status: statusCode,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Simulated error' }),
        });
      });
    },

    /**
     * Wait for a specific API request
     */
    async waitForRequest(urlPattern: string | RegExp, options?: { timeout?: number }) {
      return page.waitForRequest(urlPattern, { timeout: options?.timeout || 30000 });
    },

    /**
     * Wait for a specific API response
     */
    async waitForResponse(urlPattern: string | RegExp, options?: { timeout?: number }) {
      return page.waitForResponse(urlPattern, { timeout: options?.timeout || 30000 });
    },

    /**
     * Get list of aborted requests (for flaky simulation)
     */
    getAbortedRequests(): string[] {
      return [...abortedRequests];
    },

    /**
     * Clear all route handlers
     */
    async clearRoutes() {
      await page.unrouteAll();
      abortedRequests = [];
    },

    /**
     * Capture all network requests
     */
    async captureRequests(): Promise<Request[]> {
      const requests: Request[] = [];
      page.on('request', (request) => requests.push(request));
      return requests;
    },

    /**
     * Wait for network idle
     */
    async waitForIdle(timeout = 30000) {
      await page.waitForLoadState('domcontentloaded', { timeout });
    },
  };
}
