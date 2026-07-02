/**
 * P2-1 — viewer-state must not leak availability (or existence) of
 * hidden/moderated listings.
 *
 * The route resolves visibility with the real
 * resolvePublicListingVisibilityState helper. A listing that is not publicly
 * visible must return the same shape as a missing listing to a non-owner /
 * non-admin caller (publicAvailability: null, indistinguishable from
 * not-found). Owners and admins keep full data; ACTIVE listings are unchanged.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(Object.entries(init?.headers || {})),
    }),
  },
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    review: { findFirst: jest.fn().mockResolvedValue(null) },
    conversation: { findFirst: jest.fn().mockResolvedValue(null) },
    report: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: (value: unknown) => String(value),
}));

jest.mock("@/lib/env", () => ({
  features: {
    privateFeedback: false,
    contactPaywallEnforcement: false,
  },
}));

jest.mock("@/lib/payments/contact-paywall", () => ({
  evaluateMessageStartPaywall: jest
    .fn()
    .mockResolvedValue({ summary: null }),
}));

// Real availability resolution keys off status; moderation statusReasons are
// gated independently of searchEligible by the real visibility helper.
jest.mock("@/lib/search/public-availability", () => ({
  resolvePublicAvailability: jest.fn(
    (listing: { status?: string | null }) => ({
      availabilitySource: "HOST_MANAGED",
      publicStatus: listing?.status === "ACTIVE" ? "AVAILABLE" : "PAUSED",
      searchEligible: listing?.status === "ACTIVE",
      openSlots: 1,
      totalSlots: 1,
      effectiveAvailableSlots: 1,
      freshnessBucket: "FRESH",
      lastConfirmedAt: null,
    })
  ),
}));

import { GET } from "@/app/api/listings/[id]/viewer-state/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const LISTING_ID = "listing-viewer-state";
const OWNER_ID = "owner-1";

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: OWNER_ID,
    status: "ACTIVE",
    availableSlots: 1,
    totalSlots: 1,
    openSlots: 1,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: new Date("2026-07-01T00:00:00.000Z"),
    statusReason: null,
    physicalUnitId: "unit-1",
    ...overrides,
  };
}

function invoke() {
  return GET(
    new Request(`http://localhost/api/listings/${LISTING_ID}/viewer-state`),
    { params: Promise.resolve({ id: LISTING_ID }) }
  );
}

const suppressedRow = () =>
  listingRow({ status: "PAUSED", statusReason: "SUPPRESSED" });

describe("GET /api/listings/[id]/viewer-state visibility gate (P2-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null availability for a SUPPRESSED listing to an anonymous viewer", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(suppressedRow());

    const response = await invoke();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.publicAvailability).toBeNull();
    // No availability leak, no existence oracle.
    expect(payload.paywallSummary).toBeNull();
  });

  it("is byte-for-byte indistinguishable from a not-found listing for an anonymous viewer", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(
      suppressedRow()
    );
    const suppressedPayload = await (await invoke()).json();

    (prisma.listing.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const missingPayload = await (await invoke()).json();

    expect(suppressedPayload).toEqual(missingPayload);
  });

  it("still returns availability to the owner of a SUPPRESSED listing", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: OWNER_ID, emailVerified: new Date("2026-04-01T00:00:00Z") },
    });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(suppressedRow());

    const response = await invoke();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.publicAvailability).not.toBeNull();
    expect(payload.publicAvailability.openSlots).toBe(1);
  });

  it("still returns availability to an admin viewing a SUPPRESSED listing", async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "admin-9",
        isAdmin: true,
        emailVerified: new Date("2026-04-01T00:00:00Z"),
      },
    });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(suppressedRow());

    const payload = await (await invoke()).json();

    expect(payload.publicAvailability).not.toBeNull();
  });

  it("leaves an ACTIVE listing unchanged for an anonymous viewer", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(listingRow());

    const response = await invoke();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.publicAvailability).not.toBeNull();
    expect(payload.publicAvailability.openSlots).toBe(1);
  });
});
