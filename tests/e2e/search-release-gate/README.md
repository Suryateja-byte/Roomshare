# Search Release Gate

This folder contains the deterministic search regression lane that depends on the
test-only `x-e2e-search-scenario` seam.

Run it with:

```bash
pnpm run test:e2e:search-release-gate:ssr
pnpm run test:e2e:search-release-gate:client
```

This lane uses `/home/surya/roomshare/playwright.search-release-gate.config.ts`
instead of the main Playwright config so it can:

- start a fresh isolated server on its own port
- run against a built `next start` server for deterministic hydration
- set both server and browser search-mode feature flags
- keep the narrow project matrix for the release gate only

The specs skip unsupported Playwright projects automatically. The rest of the
suite stays untouched.

Local runs build first through `scripts/run-search-release-gate.js`. CI sets
`SEARCH_RELEASE_GATE_SKIP_BUILD=true` because the workflow already builds once
before invoking the gate.
