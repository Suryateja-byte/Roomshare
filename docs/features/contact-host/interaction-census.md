# Contact Host Interaction Census

Status: root harness alias for the existing detailed interaction census.

Evidence: `docs/features/contact-host/03-interaction-census.md` is the detailed interaction census for this package, and `docs/features/contact-host/manifest.json` lists contact-host source, runtime, and verification artifacts for the same feature scope.

| Interaction surface | Current documentation evidence | Verification state |
| --- | --- | --- |
| Listing detail contact entry point, CTA states, contact modal, and paywall/unavailable branches | `docs/features/contact-host/03-interaction-census.md` and `docs/features/contact-host/evidence-register.md` | Documented; remaining browser/runtime gaps are listed in `docs/features/contact-host/verification.json`. |
| Messaging inbox/thread interactions, polling, unread state, direct send, and mark-read behavior | `docs/features/contact-host/03-interaction-census.md` and `docs/features/contact-host/evidence-register.md` | Documented; CH-E055 route-handler status/cache-header assertions now pass in WSL after stale fixture repair. Optional direct HTTP live-server parity is P2 confidence coverage. |
| Viewer-state API fields used by contact-host UI | `docs/features/contact-host/05-api-contracts.md` and `docs/features/contact-host/07-state-management.md` | Documented; CH-E056 route-handler contract/status/cache tests now pass. Optional direct HTTP live-server parity is P2 confidence coverage. |

No new source-code behavior claim is introduced here; this file exists to satisfy the root harness package shape and points to the already-authored census plus verification gaps.
