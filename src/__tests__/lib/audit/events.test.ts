import { recordAuditEvent } from "@/lib/audit/events";

describe("recordAuditEvent", () => {
  it("writes audit events with default empty details", async () => {
    const tx = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    await recordAuditEvent(tx as never, {
      kind: "CANONICAL_UNIT_CREATED",
      actor: { role: "system", id: null },
      aggregateType: "physical_units",
      aggregateId: "unit-1",
    });

    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: {},
        }),
      })
    );
  });

  it("rejects PII-like detail keys", async () => {
    const tx = {
      auditEvent: {
        create: jest.fn(),
      },
    };

    await expect(
      recordAuditEvent(tx as never, {
        kind: "IDENTITY_MUTATION",
        actor: { role: "moderator", id: "admin-1" },
        aggregateType: "identity_mutations",
        aggregateId: "mutation-1",
        details: {
          email: "host@example.com",
        },
      })
    ).rejects.toThrow(/PII-like detail keys/);
  });

  it("allows canonicalAddressHash-style detail keys", async () => {
    const tx = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };

    await expect(
      recordAuditEvent(tx as never, {
        kind: "IDENTITY_MUTATION",
        actor: { role: "system", id: null },
        aggregateType: "identity_mutations",
        aggregateId: "mutation-2",
        details: {
          canonicalAddressHash: "abc123",
        },
      })
    ).resolves.toEqual({ auditEventId: "audit-2" });
  });

  it("rejects unknown audit kinds at the zod layer", async () => {
    const tx = {
      auditEvent: {
        create: jest.fn(),
      },
    };

    await expect(
      recordAuditEvent(tx as never, {
        kind: "NOT_A_KIND" as never,
        actor: { role: "system", id: null },
        aggregateType: "identity_mutations",
        aggregateId: "mutation-2",
      })
    ).rejects.toThrow();
  });
});
