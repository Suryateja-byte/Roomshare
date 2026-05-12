# Local Supabase bootstrap

This directory is for local-only Supabase CLI configuration.

Use the repo scripts from the workspace root:

- `pnpm supabase:init` creates `supabase/config.toml` when it is missing.
- `pnpm supabase:start` starts the local Docker-backed Supabase stack.
- `pnpm supabase:status` prints local stack endpoints.
- `pnpm supabase:rls-proof:preflight` checks that the CLI and local stack are available before later RLS proof work.

Do not set production, staging, provider project refs, access tokens, service role
keys, JWT secrets, or remote database URLs for local RLS proof commands. The
preflight intentionally refuses remote-looking Supabase environment hints.

This bootstrap does not apply schema, create RLS policies, seed data, assert RLS,
assert realtime behavior, or prove the Contact Host flow. Those remain blocked
until a later approved slice starts the local stack and adds the proof harness.
