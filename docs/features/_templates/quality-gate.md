# Final Quality Gate

Return `PASS` only when:

- Every factual claim has evidence or an explicit gap.
- Every manifest item appears in docs or gaps.
- Every user action has trigger, code path, state change, UI result, failure
  behavior, evidence, and test status.
- API contracts match route handlers and schemas.
- State model matches code.
- Diagrams match text.
- Test matrix distinguishes existing tests from recommended tests.
- Unknowns are clearly marked.
- No future or intended behavior is described as current behavior.
- No booking-system assumptions remain unless explicitly marked historical or
  removed.
- There are no P0 unsupported claims.
- There are no contradicted claims.
- There are no undocumented P0 manifest items.
