import {
  CANONICALIZER_VERSION,
  isCurrentCanonicalizerVersion,
} from "@/lib/identity/canonicalizer-version";

describe("canonicalizer-version", () => {
  it("exports the Phase 01 canonicalizer version", () => {
    expect(CANONICALIZER_VERSION).toBe("v1.0-2026-04");
  });

  it("compares by strict equality", () => {
    expect(isCurrentCanonicalizerVersion(CANONICALIZER_VERSION)).toBe(true);
    expect(isCurrentCanonicalizerVersion("v1.0-2026-05")).toBe(false);
  });
});
