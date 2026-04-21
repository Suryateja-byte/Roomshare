import {
  IDEMPOTENCY_ENDPOINT_CONTACT,
  IDEMPOTENCY_ENDPOINT_MUTATE_UNIT,
  IDEMPOTENCY_ENDPOINT_RESOLVE_UNIT,
} from "@/lib/idempotency";

describe("phase01 idempotency endpoint constants", () => {
  it("exports the canonical endpoint names", () => {
    expect(IDEMPOTENCY_ENDPOINT_RESOLVE_UNIT).toBe("identity:resolveOrCreateUnit");
    expect(IDEMPOTENCY_ENDPOINT_MUTATE_UNIT).toBe("identity:mutateUnit");
    expect(IDEMPOTENCY_ENDPOINT_CONTACT).toBe("identity:contact");
  });
});
