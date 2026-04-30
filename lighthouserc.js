/** @type {import('@lhci/cli').LighthouseConfig} */
const fs = require("node:fs");

const chromePath =
  process.env.CHROME_PATH ||
  (fs.existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : undefined);

module.exports = {
  ci: {
    collect: {
      ...(chromePath ? { chromePath } : {}),
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/search",
        "http://localhost:3000/login",
      ],
      numberOfRuns: 3,
      startServerCommand: "pnpm start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 30000,
      settings: {
        // Use mobile emulation (Lighthouse default)
        preset: "desktop",
        chromeFlags: "--no-sandbox --disable-gpu",
        // Skip audits that require network access in CI
        skipAudits: ["is-on-https"],
      },
    },
    assert: {
      assertions: {
        // Core Web Vitals — warn first, error on critical thresholds
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        interactive: ["warn", { maxNumericValue: 3800 }],

        // Performance score — warn at 0.85, error below 0.7
        "categories:performance": ["warn", { minScore: 0.85 }],

        // Accessibility — always enforce
        "categories:accessibility": ["error", { minScore: 0.9 }],

        // Best practices
        "categories:best-practices": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      // Free, no API key needed — stores results for 7 days
      target: "temporary-public-storage",
    },
  },
};
