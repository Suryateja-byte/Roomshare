# Test Matrix Template

Map each P0/P1 risk to at least one test. P2 risks should have tests where practical.

## Test Matrix Table

| Risk ID | Test Type | Test Name | What It Proves | How to Run |
|--------:|-----------|-----------|----------------|------------|
| 1 | Unit | test_invalid_json_returns_400 | API rejects malformed JSON with clear error | pytest tests/api/test_validation.py |
| 2 | Integration | test_payment_timeout_triggers_retry | Timeout triggers retry logic correctly | pytest tests/integration/test_payment.py -k timeout |
| 3 | E2E | test_duplicate_order_idempotency | Same idempotency key returns same order | playwright tests/e2e/order_flow.spec.ts |
| | | | | |

---

## Test Type Guidelines

### Unit Tests
- **Scope**: Single function/class in isolation
- **Speed**: < 1 second each
- **Use for**: Input validation, business logic, edge cases
- **Mock**: External dependencies

### Integration Tests
- **Scope**: Multiple components, real DB/cache
- **Speed**: 1-10 seconds each
- **Use for**: API contracts, DB operations, service interactions
- **Mock**: External third-party services

### E2E Tests
- **Scope**: Full user flow, real browser/app
- **Speed**: 10-60 seconds each
- **Use for**: Critical paths, multi-step flows
- **Mock**: Payment providers (use sandbox)

### Load Tests
- **Scope**: System under stress
- **Speed**: 5-30 minutes
- **Use for**: Performance regressions, scaling limits
- **Tools**: k6, locust, artillery

### Chaos Tests
- **Scope**: Failure injection
- **Speed**: Minutes
- **Use for**: Resilience verification
- **Inject**: Network partitions, latency, service crashes

---

## Coverage Checklist

For each P0/P1 risk, verify:
- [ ] At least one test exists
- [ ] Test actually exercises the failure mode
- [ ] Test runs in CI
- [ ] Test failure would block deploy
