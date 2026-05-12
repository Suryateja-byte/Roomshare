# Contact Host Firefox Matrix Goal Progress

Date: 2026-05-12

Goal: close or precisely reclassify the Contact Host Firefox browser-matrix P1
blocker after the earlier CH-E063 run stopped before app behavior because the
Playwright Firefox executable was missing.

Superseded status: CH-E065 in `goal-progress-firefox-stabilization.md` closes
the two focused Firefox spec blockers documented here after narrow test/helper
changes. This file remains the CH-E064 evidence record for browser installation
and failure reproduction.

## Checklist

- [x] Create this progress file.
- [x] Inspect Playwright config and installed browser cache.
- [x] Determine the safe repo-supported way to install or repair Playwright
  Firefox.
- [x] Do not change production code.
- [x] Install only the missing Firefox browser using the project's Playwright
  tooling.
- [x] Rerun focused Firefox listing-detail Contact Host spec.
- [x] Rerun focused Firefox messaging conversation spec.
- [x] Update Contact Host docs and `documentation-inventory.md` with exact
  results.
- [x] Run JSON parse for `verification.json` and `manifest.json`.
- [x] Run `git diff --check` for touched docs/tests.
- [x] Run stale wording scan for Firefox/browser-matrix blocker language.

## Environment Inspection

- `playwright.config.ts` defines the focused Contact Host Firefox project as
  `firefox`, using `devices["Desktop Firefox"]` and reviewer
  `storageState`.
- `pnpm exec playwright --version` returned `Version 1.59.1`.
- `node_modules/.pnpm/playwright-core@1.59.1/node_modules/playwright-core/browsers.json`
  maps Firefox to revision `1511`, browser version `148.0.2`.
- Initial cache inspection showed `/home/surya/.cache/ms-playwright` contained
  `firefox-1497`, but not `firefox-1511`.

Safe repair path: `pnpm exec playwright install firefox`. This uses the
project-installed Playwright CLI and installs only the browser named on the
command line.

## Attempt Log

- `pnpm exec playwright install firefox`
  - Result: PASS.
  - Downloaded Firefox 148.0.2, Playwright Firefox revision `1511`, to
    `/home/surya/.cache/ms-playwright/firefox-1511`.
- `ls -la /home/surya/.cache/ms-playwright/firefox-1511/firefox/firefox`
  - Result: PASS.
  - The executable now exists at the previously missing path.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=firefox --workers=1 --reporter=list`
  - Result: FAIL after app/browser execution.
  - `.last-run.json` reported `status: failed` with 5 failed Firefox tests.
  - Failure artifacts show the expected page/test assertions reached the
    browser clean-error gate. The repeated failure was
    `expect(received).toEqual(expected)` because Firefox emitted
    `Image corrupt or truncated` JavaScript errors for Next proxied Unsplash
    image URLs under `/_next/image?...`.
  - Classification: Firefox test/setup or fixture-media failure, not the prior
    missing-browser blocker. No product Contact Host behavior failure was
    proven by this run.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=firefox --workers=1 --reporter=list`
  - Result: FAIL after app/browser execution.
  - `.last-run.json` reported `status: failed` with 2 failed Firefox tests.
  - Failure artifacts:
    - J25 failed at `gotoConversationHref` on `page.goto` with
      `NS_BINDING_ABORTED; maybe frame was detached?`.
    - J26 failed at `navigateToListingHref` on `page.goto` with
      `NS_BINDING_ABORTED; maybe frame was detached?`.
  - Classification: Firefox navigation-race test/setup failure, similar to
    the prior WebKit direct-navigation race but with Firefox's abort spelling.
    No Contact Host product assertion failure was proven.

## Final Status At CH-E064

P1 status at CH-E064: reduced.

The original Firefox blocker was closed: the Playwright Firefox executable was
no longer missing. At CH-E064, the focused Firefox matrix was not closed because
both required Firefox specs still failed after browser installation. That
blocker was precisely reclassified to Firefox test/setup evidence:

- listing-detail: clean-console gate fails on Firefox image decode errors from
  fixture/external image optimization;
- messaging: direct `page.goto` helper paths fail on Firefox
  `NS_BINDING_ABORTED` navigation races.

No production code was changed.

Current status after CH-E065: the two focused Firefox failures above are closed;
the listing-detail, messaging, and practical combined Firefox runs pass, as
recorded in `goal-progress-firefox-stabilization.md`.

## Validation

- JSON parse passed:
  - `docs/features/contact-host/verification.json`: 17 claims parsed.
  - `docs/features/contact-host/manifest.json`: feature `contact-host` parsed.
- `git diff --check` passed for the touched tracked docs.
- `git diff --check --no-index -- /dev/null docs/features/contact-host/goal-progress-firefox-matrix.md`
  produced no whitespace-error output; the nonzero exit is expected because
  `--no-index` reports the new untracked file as different from `/dev/null`.
- Stale Firefox/browser-matrix blocker wording scan returned no matches for the
  old current-status phrases.
