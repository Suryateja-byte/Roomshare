import { appendOutboxEvent } from "@/lib/outbox/append";

describe("appendOutboxEvent", () => {
  it("defaults priority to 100", async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: "outbox-1" }),
      },
    };

    await appendOutboxEvent(tx as never, {
      aggregateType: "PHYSICAL_UNIT",
      aggregateId: "unit-1",
      kind: "UNIT_UPSERTED",
      payload: { created: true },
      sourceVersion: BigInt(1),
      unitIdentityEpoch: 1,
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 100,
        }),
      })
    );
  });

  it("rejects unknown aggregate types at the zod layer", async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    await expect(
      appendOutboxEvent(tx as never, {
        aggregateType: "BAD_TYPE" as never,
        aggregateId: "unit-1",
        kind: "UNIT_UPSERTED",
        payload: {},
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    ).rejects.toThrow();
  });
});
