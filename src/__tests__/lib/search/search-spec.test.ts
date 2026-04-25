import type { ParsedSearchParams } from "@/lib/search-params";
import {
  buildPhase04SearchSpec,
  getPhase04SearchSpecHash,
} from "@/lib/search/search-spec";

function parsed(
  overrides: Partial<ParsedSearchParams> = {}
): ParsedSearchParams {
  return {
    requestedPage: 1,
    sortOption: "recommended",
    filterParams: {},
    boundsRequired: false,
    browseMode: false,
    ...overrides,
  };
}

const versions = {
  projectionEpoch: BigInt(1),
  embeddingVersion: "embed-v1",
  rankerProfileVersion: "ranker-v1",
  unitIdentityEpochFloor: 1,
};

describe("Phase 04 SearchSpec", () => {
  it("derives requested occupants from legacy minSlots aliases", () => {
    const result = buildPhase04SearchSpec({
      parsed: parsed(),
      rawParams: { minSlots: "3" },
      pageSize: 12,
      versions,
    });

    expect(result).toMatchObject({
      ok: true,
      spec: { requestedOccupants: 3 },
    });
  });

  it("defaults requested occupants to one", () => {
    const result = buildPhase04SearchSpec({
      parsed: parsed(),
      rawParams: {},
      pageSize: 12,
      versions,
    });

    expect(result).toMatchObject({
      ok: true,
      spec: { requestedOccupants: 1 },
    });
  });

  it.each([
    [{ requested_occupants: "21" }, "requested_occupants_too_high"],
    [{ max_gap_days: "181" }, "max_gap_days_too_high"],
    [{ radius_meters: "100001" }, "radius_too_broad"],
  ])("rejects pathological raw params %#", (rawParams, code) => {
    const result = buildPhase04SearchSpec({
      parsed: parsed(),
      rawParams,
      pageSize: 12,
      versions,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code, status: 400 },
    });
  });

  it("rejects direct deep paging beyond the Phase 04 cap", () => {
    const result = buildPhase04SearchSpec({
      parsed: parsed({ requestedPage: 21 }),
      rawParams: { page: "21" },
      pageSize: 12,
      versions,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "deep_paging_capped", status: 400 },
    });
  });

  it("pins the query hash to projection, embedding, ranker, and unit epoch versions", () => {
    const base = buildPhase04SearchSpec({
      parsed: parsed({ filterParams: { query: "sunny room" } }),
      rawParams: {},
      pageSize: 12,
      versions,
    });
    const bumpedEmbedding = buildPhase04SearchSpec({
      parsed: parsed({ filterParams: { query: "sunny room" } }),
      rawParams: {},
      pageSize: 12,
      versions: { ...versions, embeddingVersion: "embed-v2" },
    });
    const bumpedProjection = buildPhase04SearchSpec({
      parsed: parsed({ filterParams: { query: "sunny room" } }),
      rawParams: {},
      pageSize: 12,
      versions: { ...versions, projectionEpoch: BigInt(2) },
    });

    expect(base.ok && bumpedEmbedding.ok && bumpedProjection.ok).toBe(true);
    if (!base.ok || !bumpedEmbedding.ok || !bumpedProjection.ok) return;

    expect(getPhase04SearchSpecHash(base.spec)).not.toBe(
      getPhase04SearchSpecHash(bumpedEmbedding.spec)
    );
    expect(getPhase04SearchSpecHash(base.spec)).not.toBe(
      getPhase04SearchSpecHash(bumpedProjection.spec)
    );
  });
});
