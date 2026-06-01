# Launch Infra Preflight

Phase 10 final approval requires these checks before launch signoff.

## Required Local Checks

```bash
pnpm exec prisma validate
pnpm typecheck
pnpm lint
pnpm run scan:public-payload-pii -- scripts/fixtures/public-payload-clean.json
pnpm run seed:e2e
```

`pnpm run seed:e2e` requires Postgres at `localhost:5433` using the repo's
standard E2E DSN:

```text
postgresql://postgres:password@localhost:5433/roomshare?schema=public
```

If Postgres is unavailable locally, final launch approval remains blocked until
Docker Desktop WSL integration, a local Postgres service, or a staging database
with equivalent migrations and seed coverage is available.

## Staging QA Data Seed

Use the guarded staging seed only for non-production QA environments:

```bash
pnpm run seed:staging -- --dry-run
STAGING_SEED_ENV=staging \
STAGING_SEED_CONFIRM=non-production \
STAGING_SEED_PASSWORD='<shared QA password from the vault>' \
pnpm run seed:staging -- --apply
```

The script refuses `VERCEL_ENV=production`, refuses
`STAGING_SEED_ENV=production`, rejects production-looking database names or
hosts, and requires `STAGING_SEED_CONFIRM=non-production` before writing to a
remote database. It uses canonical `@roomshare.dev` QA accounts and
deterministic `staging-*` listing IDs so repeated runs are idempotent.

After applying to staging, refresh canonical inventory/search projections and
run the real-environment smoke:

```bash
pnpm run backfill:canonical-inventory -- --apply
```

## Production Configuration Check

- `CRON_SECRET` and `METRICS_SECRET` are strong, non-placeholder secrets.
- `CURSOR_SECRET`, `PUBLIC_CACHE_CURSOR_SECRET`, and cache key secrets are
  configured before public cache coherence is enabled.
- Stripe live-mode separation is configured before payment enforcement.
- Turnstile is configured before production auth traffic.
- Sentry DSN is configured and SLO stubs in `ops/slo/launch-slo-alerts.json`
  are mapped to project alerts.
