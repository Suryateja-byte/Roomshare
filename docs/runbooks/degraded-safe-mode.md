# Degraded Safe Mode Runbook

Degraded safe mode is the launch fallback when search, semantic, privacy, or
publication risk is uncertain.

## Enable

Set the bundle:

```bash
KILL_SWITCH_FORCE_LIST_ONLY=true
KILL_SWITCH_DISABLE_SEMANTIC_SEARCH=true
KILL_SWITCH_DISABLE_PHONE_REVEAL=true
KILL_SWITCH_DISABLE_NEW_PUBLICATION=true
```

Optional incident-specific additions:

```bash
KILL_SWITCH_DISABLE_PAYMENTS=true
KILL_SWITCH_FREEZE_NEW_GRANTS=true
KILL_SWITCH_DISABLE_ALERTS=true
KILL_SWITCH_DISABLE_PUBLIC_CACHE_PUSH=true
```

## Expected Behavior

- Public search stays list-only and filter-only.
- Existing published projections remain readable.
- New publication pauses.
- Phone reveal fails closed.
- Public discovery and anonymous search remain free.

## Disable

Clear one switch at a time, starting with publication, then semantic search, then
phone reveal, then map/list mode. Watch the matching SLO stubs after every
change.

## Evidence

- Bundle evaluator:
  `src/__tests__/launch/phase10-launch-hardening.test.ts`
