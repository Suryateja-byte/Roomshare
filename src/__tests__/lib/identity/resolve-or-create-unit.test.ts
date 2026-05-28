import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";

function makeTx(
  sourceVersion: bigint,
  overrides: Partial<{
    geocodeStatus: string;
    canonicalUnit: string;
    canonicalizerVersion: string;
  }> = {}
) {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    physicalUnit: {
      upsert: jest.fn().mockResolvedValue({
        id: "unit-1",
        unitIdentityEpoch: 1,
        canonicalUnit: overrides.canonicalUnit ?? "_none_",
        canonicalizerVersion: overrides.canonicalizerVersion ?? "v1",
        geocodeStatus: overrides.geocodeStatus ?? "PENDING",
        sourceVersion,
      }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
}

describe("resolveOrCreateUnit", () => {
  it("creates a new unit and emits outbox + audit rows", async () => {
    const tx = makeTx(BigInt(1));

    const result = await resolveOrCreateUnit(tx as never, {
      actor: { role: "host", id: "user-1" },
      address: {
        address: "123 Main Street",
        city: "Austin",
        state: "tx",
        zip: "73301",
      },
      requestId: "req-1",
    });

    expect(result.created).toBe(true);
    expect(result.unitId).toBe("unit-1");
    expect(tx.physicalUnit.upsert).toHaveBeenCalledTimes(1);
    // Phase 02: on new unit creation, two outbox events are emitted:
    // 1. UNIT_UPSERTED (always)
    // 2. GEOCODE_NEEDED (only for newly created units, so geocoder can resolve lat/lng)
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.outboxEvent.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "GEOCODE_NEEDED",
          payload: expect.objectContaining({
            address: "123 Main Street, Austin, tx 73301",
            canonicalAddressHash: result.canonicalAddressHash,
          }),
        }),
      })
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("treats an existing row as resolved and increments via the upsert update path", async () => {
    const tx = makeTx(BigInt(2));

    const result = await resolveOrCreateUnit(tx as never, {
      actor: { role: "system", id: null },
      address: {
        address: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "73301",
      },
    });

    expect(result.created).toBe(false);
    expect(tx.physicalUnit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sourceVersion: { increment: BigInt(1) },
          rowVersion: { increment: BigInt(1) },
        }),
      })
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "GEOCODE_NEEDED" }),
      })
    );
  });

  it("does not enqueue duplicate geocode work for an existing active geocode event", async () => {
    const tx = makeTx(BigInt(2));
    tx.$queryRaw.mockResolvedValueOnce([{ id: "geocode-active" }]);

    await resolveOrCreateUnit(tx as never, {
      actor: { role: "system", id: null },
      address: {
        address: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "73301",
      },
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "UNIT_UPSERTED" }),
      })
    );
  });

  it("uses trusted coordinates to complete geocode state without enqueueing geocode work", async () => {
    const tx = makeTx(BigInt(1));
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: "unit-1",
        unitIdentityEpoch: 1,
        canonicalUnit: "_none_",
        canonicalizerVersion: "v1",
        geocodeStatus: "COMPLETE",
        sourceVersion: BigInt(2),
      },
    ]);

    const result = await resolveOrCreateUnit(tx as never, {
      actor: { role: "host", id: "user-1" },
      address: {
        address: "1121 Hidden Rdg",
        city: "Irving",
        state: "TX",
        zip: "75038",
      },
      trustedCoordinates: { lat: 32.87742, lng: -96.96477 },
    });

    expect(result.geocodeStatus).toBe("COMPLETE");
    expect(result.sourceVersion).toBe(BigInt(2));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "UNIT_UPSERTED",
          sourceVersion: BigInt(2),
          payload: expect.objectContaining({ trustedCoordinates: true }),
        }),
      })
    );
  });

  it("does not overwrite an already complete geocode row with trusted coordinates", async () => {
    const tx = makeTx(BigInt(5), { geocodeStatus: "COMPLETE" });

    const result = await resolveOrCreateUnit(tx as never, {
      actor: { role: "host", id: "user-1" },
      address: {
        address: "1121 Hidden Rdg",
        city: "Irving",
        state: "TX",
        zip: "75038",
      },
      trustedCoordinates: { lat: 32.87742, lng: -96.96477 },
    });

    expect(result.geocodeStatus).toBe("COMPLETE");
    expect(result.sourceVersion).toBe(BigInt(5));
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "UNIT_UPSERTED" }),
      })
    );
  });
});
