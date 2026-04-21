import { recordIdentityMutation } from "@/lib/identity/mutate-unit";

function makePhysicalUnit(id: string, epoch: number, supersedesUnitIds: string[] = []) {
  return { id, unitIdentityEpoch: epoch, supersedesUnitIds };
}

function makeTx(units = [makePhysicalUnit("unit-a", 2), makePhysicalUnit("unit-b", 4)]) {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(0),
    physicalUnit: {
      findMany: jest.fn().mockResolvedValue(units),
      update: jest.fn().mockResolvedValue({}),
    },
    identityMutation: {
      create: jest.fn().mockResolvedValue({ id: "mutation-1" }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
}

describe("recordIdentityMutation", () => {
  it("rejects MERGE inputs that target more than one destination unit", async () => {
    const tx = makeTx([makePhysicalUnit("unit-a", 1)]);

    await expect(
      recordIdentityMutation(tx as never, {
        kind: "MERGE",
        fromUnitIds: ["unit-a"],
        toUnitIds: ["unit-b", "unit-c"],
        reasonCode: "operator_duplicate",
        operatorId: "moderator-1",
      })
    ).rejects.toThrow("MERGE requires exactly one target unit id");

    expect(tx.identityMutation.create).not.toHaveBeenCalled();
  });

  it("rejects SPLIT inputs that provide more than one source unit", async () => {
    const tx = makeTx([makePhysicalUnit("unit-a", 1)]);

    await expect(
      recordIdentityMutation(tx as never, {
        kind: "SPLIT",
        fromUnitIds: ["unit-a", "unit-b"],
        toUnitIds: ["unit-c"],
        reasonCode: "operator_split",
        operatorId: "moderator-1",
      })
    ).rejects.toThrow("SPLIT requires exactly one source unit id");

    expect(tx.identityMutation.create).not.toHaveBeenCalled();
  });

  it("records a merge, bumps epochs, and emits a high-priority outbox event", async () => {
    const tx = makeTx([
      makePhysicalUnit("unit-a", 1),
      makePhysicalUnit("unit-b", 3),
      makePhysicalUnit("unit-target", 2, ["unit-a"]),
    ]);

    const result = await recordIdentityMutation(tx as never, {
      kind: "MERGE",
      fromUnitIds: ["unit-a", "unit-b"],
      toUnitIds: ["unit-target"],
      reasonCode: "operator_duplicate",
      operatorId: "moderator-1",
    });

    expect(result.resultingEpoch).toBe(4);
    expect(result.affectedUnitIds).toEqual(["unit-a", "unit-b", "unit-target"]);
    expect(tx.identityMutation.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: 0,
        }),
      })
    );
    expect(tx.physicalUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "unit-target" },
        data: expect.objectContaining({
          supersedesUnitIds: ["unit-a", "unit-b"],
        }),
      })
    );
  });

  it("requires all target units to already exist for splits", async () => {
    const tx = makeTx([makePhysicalUnit("unit-a", 1), makePhysicalUnit("unit-b", 1)]);

    await expect(
      recordIdentityMutation(tx as never, {
        kind: "SPLIT",
        fromUnitIds: ["unit-a"],
        toUnitIds: ["unit-b", "unit-c"],
        reasonCode: "operator_split",
        operatorId: "moderator-1",
      })
    ).rejects.toThrow("Unknown physical unit: unit-c");
  });

  it("allows canonicalizer upgrades without an operator id", async () => {
    const tx = makeTx([makePhysicalUnit("unit-a", 5)]);

    const result = await recordIdentityMutation(tx as never, {
      kind: "CANONICALIZER_UPGRADE",
      fromUnitIds: ["unit-a"],
      toUnitIds: ["unit-a"],
      reasonCode: "canonicalizer_upgrade",
      operatorId: null,
    });

    expect(result.mutationId).toBe("mutation-1");
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorRole: "system",
          actorId: null,
        }),
      })
    );
  });
});
