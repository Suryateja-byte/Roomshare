# Backup Restore Drill Runbook

Phase 10 launch approval requires a restore drill posture and a semantic smoke
check after restore.

## Local Prerequisite

Local approval requires Postgres reachable at `localhost:5433` so
`pnpm run seed:e2e` can run against the same DSN used by the E2E seed script.
If Docker is unavailable in WSL, start Postgres through Docker Desktop WSL
integration or another local service before final launch approval.

## Restore Drill

1. Take a backup from the staging database.
2. Restore into an isolated drill database.
3. Run migrations and Prisma validation.
4. Run the semantic smoke helper against the restored semantic projection rows.
5. Inspect pending outbox rows and decide whether replay is required.
6. Record restore duration, semantic candidate count, and outbox replay posture.

## Commands

```bash
pnpm exec prisma validate
pnpm run seed:e2e
```

## Evidence

- Restore smoke helper:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
