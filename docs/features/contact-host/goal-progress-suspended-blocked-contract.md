# Contact Host Suspended / Blocked Contract Progress

Goal: implement the approved Option A proof path for suspended and blocked
listing-detail Contact Host states.

Current outcome: `P1 CLOSED`. The viewer-state contract, listing-detail disabled
CTA copy, seed/auth fixtures, route coverage, and Chromium browser proof now
cover all four approved states. The focused suspended/blocked browser command
passed, and the full listing-detail Contact Host Chromium spec passed. This
slice first rechecked the prior environment blocker and found no Roomshare
process listening on `localhost:3000`, so Playwright used the repo-configured
`webServer` startup path from the Linux-side workspace instead of touching the
unrelated server on port 3001.

## Approved Disabled Reasons

| State | `contactDisabledReason` | Button copy | Helper copy |
|---|---|---|---|
| Suspended viewer | `VIEWER_SUSPENDED` | `Messaging Unavailable` | `Your account cannot start new conversations right now.` |
| Suspended host | `HOST_SUSPENDED` | `Host Not Accepting Messages` | `This host is not accepting new conversations right now.` |
| Viewer blocks host | `VIEWER_BLOCKED_HOST` | `Unblock Host to Contact` | `Remove your block to start a new conversation with this host.` |
| Host blocks viewer | `HOST_BLOCKED_VIEWER` | `Contact Unavailable` | `Messaging is unavailable for this listing right now.` |

## Implementation Evidence

| Area | Evidence | Status |
|---|---|---|
| Contract enum/coercion | `src/lib/listings/public-contact-contract.ts:14-25`, `src/lib/listings/public-contact-contract.ts:254-268` | Implemented |
| Viewer-state restriction precedence | `src/app/api/listings/[id]/viewer-state/route.ts:33-116`, `src/app/api/listings/[id]/viewer-state/route.ts:163-183`, `src/app/api/listings/[id]/viewer-state/route.ts:233-342` | Implemented |
| Listing-detail UI copy | `src/app/listings/[id]/ListingPageClient.tsx:529-649` | Implemented |
| Route unit coverage | `src/__tests__/api/listings-viewer-state-route.test.ts:149-152`, `src/__tests__/api/listings-viewer-state-route.test.ts:441-492` | Passed |
| E2E auth and seed fixtures | `tests/e2e/auth.setup.ts:1-8`, `tests/e2e/auth.setup.ts:178-198`, `scripts/seed-e2e.js:397-443`, `scripts/seed-e2e.js:1090-1151`, `scripts/seed-e2e.js:1646-1651` | Fixture source added |
| Browser proof source | `tests/e2e/listing-detail/contact-host-runtime.spec.ts:86-90`, `tests/e2e/listing-detail/contact-host-runtime.spec.ts:302-376`, `tests/e2e/listing-detail/contact-host-runtime.spec.ts:591-662` | Chromium proof passed |

## Verification Status

| Check | Result |
|---|---|
| Narrow route/Jest proof | Passed: `pnpm test -- src/__tests__/api/listings-viewer-state-route.test.ts --runInBand` exited 0 with 1 suite and 11 tests passing. |
| TypeScript check | Passed: `pnpm exec tsc --noEmit --pretty false` exited 0. |
| Focused Chromium suspended/blocked proof | Passed from `/home/surya/roomshare`: `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --workers=1 --reporter=list -g "suspended viewer\|suspended host\|viewer blocks host\|host blocks viewer"` exited 0. JSON rerun recorded 8 expected, 1 skipped, 0 unexpected, 0 flaky. |
| Full listing-detail Contact Host Chromium spec | Passed from `/home/surya/roomshare`: `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --workers=1 --reporter=list` exited 0. JSON rerun recorded 15 expected, 1 skipped, 0 unexpected, 0 flaky. |
| JSON parse and diff hygiene | `verification.json` and `manifest.json` parsed successfully; final diff hygiene is tracked by the command report for this slice. |

## Closure Notes

The suspended/blocked listing-detail Chromium P1 is closed by CH-E073. The
commands used Playwright's configured Linux-side webServer startup because the
pre-run health probe found `localhost:3000` refusing connections and only an
unrelated Next server on port 3001.

```bash
pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --reporter=list --workers=1 -g "suspended viewer|suspended host|viewer blocks host|host blocks viewer"
pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=chromium --reporter=list --workers=1
```

Close criteria met: all four browser states show the disabled Contact Host UI
before click, the viewer-state payload has the expected disabled reason, no
`startConversation` request is sent, the page does not navigate to `/messages`,
and the page/body/payload do not disclose block row details or fixture emails.
