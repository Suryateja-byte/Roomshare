# Privacy Audit Runbook

Run this before launch signoff and after any incident involving public search,
listing detail, alerts, service-worker cache, or contact/phone reveal.

## Public Payload Audit

1. Capture representative public JSON payloads from search, listings, map,
   count, autocomplete, and listing detail metadata.
2. Save samples without user identifiers.
3. Run the public payload scanner against the samples.
4. Confirm no exact address, unit number, raw phone, precise coordinate, private
   listing field, raw push endpoint, or email appears.

## Scanner Command

```bash
pnpm run scan:public-payload-pii -- scripts/fixtures/public-payload-clean.json
```

## Manual Review

- Public cards and map popups may show area, public cell, public title/subtitle,
  room category, price, availability window, and grouped unit key.
- Contact and reveal flows must never expose raw phone or host contact data
  unless the gated reveal path succeeds.
- Alert deliveries must revalidate visibility immediately before delivery.

## Evidence

- Scanner tests:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
- Cache coherence runbook:
  `docs/runbooks/public-cache-coherence.md`
