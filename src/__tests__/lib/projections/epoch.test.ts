/**
 * Tests for src/lib/projections/epoch.ts
 */
import {
  currentProjectionEpoch,
  __setProjectionEpochForTesting,
} from "@/lib/projections/epoch";

afterEach(() => {
  __setProjectionEpochForTesting(null);
  delete process.env.PROJECTION_EPOCH;
});

describe("currentProjectionEpoch()", () => {
  it("returns BigInt(1) by default (no env var)", () => {
    expect(currentProjectionEpoch()).toBe(BigInt(1));
  });

  it("reads PROJECTION_EPOCH env var", () => {
    process.env.PROJECTION_EPOCH = "42";
    expect(currentProjectionEpoch()).toBe(BigInt(42));
  });

  it("test override takes precedence over env var", () => {
    process.env.PROJECTION_EPOCH = "42";
    __setProjectionEpochForTesting(BigInt(7));
    expect(currentProjectionEpoch()).toBe(BigInt(7));
  });

  it("null override restores env-derived value", () => {
    __setProjectionEpochForTesting(BigInt(99));
    __setProjectionEpochForTesting(null);
    expect(currentProjectionEpoch()).toBe(BigInt(1));
  });

  it("returns bigint type", () => {
    expect(typeof currentProjectionEpoch()).toBe("bigint");
  });
});

describe("__setProjectionEpochForTesting()", () => {
  it("accepts bigint values", () => {
    __setProjectionEpochForTesting(BigInt(5));
    expect(currentProjectionEpoch()).toBe(BigInt(5));
  });

  it("accepts null to reset", () => {
    __setProjectionEpochForTesting(BigInt(5));
    __setProjectionEpochForTesting(null);
    expect(currentProjectionEpoch()).toBe(BigInt(1));
  });
});
