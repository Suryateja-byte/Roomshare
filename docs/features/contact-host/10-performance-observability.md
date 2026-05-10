# Performance And Observability

Status: source-backed performance and observability inventory; runtime persistence/delivery checks remain gaps where marked.

## Rate Limits

| Operation | Configured limit | Evidence |
|---|---:|---|
| Start conversation | 20/hour | CH-E026 |
| Send message | 100/hour | CH-E026 |
| Messages API | 60/hour | CH-E026 |
| Message polling | 180/minute | CH-E026 |
| Mark read | 120/minute | CH-E026 |
| Messages pre-auth IP gate | 300/hour per IP | CH-E026 |
| Viewer state | 60/minute | CH-E026 |
| Checkout creation | 10/hour | CH-E026 |
| Checkout-session status | 60/minute | `manifest.json` rate limits |

## Observability Signals

| Signal | Source-observed behavior | Evidence | Gap |
|---|---|---|---|
| Contact attempts | Start outcomes are recorded for success, existing/resurrected, paywall-required/unavailable, stale epoch, and related outcomes. | CH-E011 | Runtime persistence not verified |
| Paywall telemetry | Contact paywall paths record or branch on entitlement/contact state. | CH-E010 | Full webhook/fulfillment telemetry not inspected |
| Outbound content flags | Message send scans and records soft flags before persistence. | CH-E013 | Flag review flow not documented here |
| Notifications | Internal notification rows are created after message persistence. | CH-E014 | Runtime row creation not executed |
| Email | Preference-aware email send calls are made for new messages. | CH-E014 | Delivery not verified |
| Realtime fallback | Client code switches from realtime to polling on failure states. | `phase-4/01-ui-interaction-census.md` | Supabase runtime not verified |

## Performance Gaps

- No runtime latency or throughput checks have been run for contact start, message send, polling, checkout-session polling, or inbox load. Evidence: CH-E029.
- The transaction/advisory-lock path is source-observed but not load-tested in this pass. Evidence: CH-E008.
- Polling/realtime behavior is source-observed but not runtime-measured. Evidence: `unknowns.md` CH-U005.
