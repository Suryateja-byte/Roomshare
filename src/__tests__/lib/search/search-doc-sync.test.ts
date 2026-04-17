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
      debug: jest.fn(),
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
  projectSearchDocument,
  SEARCH_DOC_PROJECTION_VERSION,
  upsertSearchDocSync,
} from "@/lib/search/search-doc-sync";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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

function makeProjectableListingSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    ownerId: "owner-1",
    title: "Sunny room",
    description: "Quiet host-managed room",
    price: 1200,
    images: ["image-1"],
    amenities: ["Desk"],
    houseRules: ["No smoking"],
    householdLanguages: ["English"],
    primaryHomeLanguage: "English",
    leaseDuration: "monthly",
    roomType: "private_room",
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    totalSlots: 2,
    availableSlots: 1,
    availabilitySource: "HOST_MANAGED",
    openSlots: 1,
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: new Date("2026-04-10T00:00:00.000Z"),
    statusReason: null,
    viewCount: 10,
    status: "ACTIVE",
    bookingMode: "contact-first",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-10T00:00:00.000Z"),
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    lat: 30.2672,
    lng: -97.7431,
    avgRating: 4.5,
    reviewCount: 3,
    version: 5,
    docUpdatedAt: new Date("2026-04-01T00:00:00.000Z"),
    docSourceVersion: 4,
    docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION,
    ...overrides,
  };
}

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockInfo = logger.sync.info as jest.Mock;

describe("getProjectionDivergenceReason", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryRaw.mockReset();
    mockExecuteRaw.mockReset();
  });

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

  it("suppresses stale cron writes when a newer doc version already won the race", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeProjectableListingSnapshot()]);
    mockExecuteRaw.mockResolvedValueOnce(0);

    const result = await projectSearchDocument("listing-1");

    expect(result).toMatchObject({
      listingId: "listing-1",
      outcome: "upsert",
      divergenceReason: "version_skew",
      casSuppressionReason: "older_source_version",
      writeApplied: false,
      listingVersion: 5,
      docSourceVersion: 4,
    });

    const writeSql = Array.from(
      mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray
    ).join(" ");
    expect(writeSql).toContain(
      "WHERE listing_search_docs.source_version <= EXCLUDED.source_version"
    );
    expect(writeSql).toContain(
      "AND listing_search_docs.projection_version <= EXCLUDED.projection_version"
    );
  });

  it("treats CAS-suppressed writes as a handled sync outcome", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeProjectableListingSnapshot()]);
    mockExecuteRaw.mockResolvedValueOnce(0);

    await expect(upsertSearchDocSync("listing-1")).resolves.toBe(true);
  });

  it("classifies projection-version CAS suppression before the write and logs only hashed ids", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeProjectableListingSnapshot({
        version: 5,
        docSourceVersion: 5,
        docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION + 1,
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(0);

    const result = await projectSearchDocument("listing-1");

    expect(result).toMatchObject({
      listingId: "listing-1",
      outcome: "upsert",
      casSuppressionReason: "older_projection_version",
      writeApplied: false,
      listingVersion: 5,
      docSourceVersion: 5,
      docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION + 1,
    });
    expect(mockInfo).toHaveBeenCalledWith(
      "Search doc write suppressed by version CAS",
      expect.objectContaining({
        event: "cfm.search.doc.cas_suppressed",
        listingIdHash: expect.stringMatching(/^[0-9a-f]{16}$/),
        reason: "older_projection_version",
      })
    );

    const logPayload = mockInfo.mock.calls[mockInfo.mock.calls.length - 1]?.[1];
    expect(logPayload).not.toHaveProperty("listingId");
    expect(JSON.stringify(logPayload)).not.toContain("listing-1");
  });

  it("prefers source-version CAS suppression when both versions look older than the existing doc", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeProjectableListingSnapshot({
        version: 4,
        docSourceVersion: 5,
        docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION + 1,
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(0);

    const result = await projectSearchDocument("listing-1");

    expect(result).toMatchObject({
      listingId: "listing-1",
      outcome: "upsert",
      casSuppressionReason: "older_source_version",
      writeApplied: false,
      listingVersion: 4,
      docSourceVersion: 5,
      docProjectionVersion: SEARCH_DOC_PROJECTION_VERSION + 1,
    });
  });
});
