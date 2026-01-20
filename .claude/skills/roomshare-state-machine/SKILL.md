---
name: roomshare-state-machine
description: Use for holds, bookings, waitlists, availability, cancellations, and any inventory state transitions. Enforce invariants + edge cases.
---

# Roomshare State Machine Rules

## Invariants checklist

- Define allowed states and transitions (table).
- All transitions are server-enforced.
- Prevent race conditions (idempotency keys / transactions).
- Abuse cases: spam holds, multi-account, rapid apply/cancel.

## Required output

1. State transition table
2. Invariants
3. Test plan (at least 8 tests)
