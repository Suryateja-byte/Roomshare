# Edge Case Register Template

Copy and populate this table for the Edge Case Register section.

## Risk Scoring Reference

**Probability (1-5):**
- 1: Rare (< 0.1% of requests)
- 2: Unlikely (0.1-1%)
- 3: Possible (1-10%)
- 4: Likely (10-50%)
- 5: Almost certain (> 50%)

**Impact (1-5):**
- 1: Minimal (cosmetic, self-recovering)
- 2: Minor (user retry works)
- 3: Moderate (user frustrated, manual fix)
- 4: Major (data corruption, business impact)
- 5: Critical (security breach, money loss, legal)

**Priority Rules:**
- **P0**: (Prob ≥4 AND Impact ≥4) OR any data loss/security/money
- **P1**: Score 9-15 with user-visible correctness impact
- **P2**: Score 4-8 OR low-prob/high-impact
- **P3**: Score ≤3, document as accepted risk

---

## Register Table

| ID | Category | Scenario | Prob (1-5) | Impact (1-5) | Score | Priority | Mitigation | Tests | Observability |
|---:|----------|----------|:----------:|:------------:|:-----:|:--------:|------------|-------|---------------|
| 1 | Input | Invalid JSON payload | 3 | 2 | 6 | P2 | Schema validation at API boundary | Unit: malformed JSON returns 400 | Log: validation_error count |
| 2 | Network | Payment provider timeout | 2 | 5 | 10 | P1 | 10s timeout, retry x2, circuit breaker | Integration: mock timeout response | Alert: payment_timeout_rate > 1% |
| 3 | Concurrency | Double-click creates duplicate order | 4 | 4 | 16 | P0 | Idempotency key on order creation | E2E: rapid duplicate POST returns same order | Metric: duplicate_order_attempts |
| | | | | | | | | | |

---

## Mitigation Patterns (quick reference)

Prefer generic over bespoke:
- **Invalid input** → Schema validation
- **Duplicate operations** → Idempotency keys
- **External timeouts** → Timeout + retry + circuit breaker
- **Race conditions** → Optimistic locking / unique constraints
- **Unknown failures** → Feature flag + alert on error rate
