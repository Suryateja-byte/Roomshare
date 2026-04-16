/**
 * Unit tests for search-doc-sync divergence detection.
 *
 * Covers the version-aware divergence reasons introduced in CFM-405a:
 * - missing_doc when no doc exists yet
 * - stale_doc when docUpdatedAt < listing.updatedAt (pre-existing behavior)
 * - version_skew when listing.version > doc.sourceVersion OR
 *   doc.projectionVersion < SEARCH_DOC_PROJECTION_VERSION
 */

jest.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn(), $executeRaw: jest.fn() },
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : "unknown"
  ),
}));

import {
  getProjectionDivergenceReason,
  SEARCH_DOC_PROJECTION_VERSION,
} from "@/lib/search/search-doc-sync";

function makeListing(overrides: {
  docUpdatedAt?: Date | null;
  updatedAt?: Date;
  version?: number;
  docSourceVersion?: number | null;
  docProjectionVersion?: number | null;
} = {}) {
  return {
    docUpdatedAt: new Date("2026-04-10T00:00:00.000Z"),
    updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    version: 1,
    docSourceVersion: 1,
    docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION,
    ...overrides,
  };
}

describe("getProjectionDivergenceReason", () => {
  it("returns 'missing_doc' when no search doc row exists", () => {
    expect(
      getProjectionDivergenceReason(makeListing({ docUpdatedAt: null }))
    ).toBe("missing_doc");
  });

  it("returns 'version_skew' when listing.version > doc.sourceVersion", () => {
    expect(
      getProjectionDivergenceReason(
        makeListing({ version: 5, docSourceVersion: 3 })
      )
    ).toBe("version_skew");
  });

  it("returns 'version_skew' when doc.projectionVersion is lower than current", () => {
    expect(
      getProjectionDivergenceReason(
        makeListing({ docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION - 1 })
      )
    ).toBe("version_skew");
  });

  it("prioritizes version_skew over stale_doc when both hold", () => {
    const stale = makeListing({
      version: 5,
      docSourceVersion: 1,
      docUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    });
    expect(getProjectionDivergenceReason(stale)).toBe("version_skew");
  });

  it("returns 'stale_doc' when docUpdatedAt < listing.updatedAt and versions match", () => {
    expect(
      getProjectionDivergenceReason(
        makeListing({
          docUpdatedAt: new Date("2026-04-09T00:00:00.000Z"),
          updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        })
      )
    ).toBe("stale_doc");
  });

  it("returns null when doc is fresh and versions match", () => {
    expect(getProjectionDivergenceReason(makeListing())).toBeNull();
  });

  it("does not flag version_skew when docSourceVersion is null (legacy rows before backfill)", () => {
    // Prior to CFM-405a, source_version did not exist; MAX(sd.source_version) on
    // a row without that column is NULL. Treat null as "unknown", not skew.
    expect(
      getProjectionDivergenceReason(
        makeListing({ version: 5, docSourceVersion: null })
      )
    ).toBeNull();
  });

  it("does not flag version_skew when docProjectionVersion is null", () => {
    expect(
      getProjectionDivergenceReason(
        makeListing({ docProjectionVersion: null })
      )
    ).toBeNull();
  });

  it("tolerates source_version default of 0 from the migration (listing.version >= 1 flags skew)", () => {
    // New column defaults to 0; listing.version defaults to 1. Existing rows
    // from before the migration will look "skewed" until the cron rewrites them.
    expect(
      getProjectionDivergenceReason(
        makeListing({ version: 1, docSourceVersion: 0 })
      )
    ).toBe("version_skew");
  });

  it("exports SEARCH_DOC_PROJECTION_VERSION as an integer >= 1", () => {
    expect(Number.isInteger(SEARCH_DOC_PROJECTION_VERSION)).toBe(true);
    expect(SEARCH_DOC_PROJECTION_VERSION).toBeGreaterThanOrEqual(1);
  });
});
