jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    location: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/geocoding", () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock("@/lib/data", () => ({}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error"
  ),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/listing-language-guard", () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}));

jest.mock("@/lib/languages", () => ({
  isValidLanguageCode: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/idempotency", () => ({
  withIdempotency: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-sync", () => ({
  upsertSearchDocSync: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/search-alerts", () => ({
  triggerInstantAlerts: jest.fn().mockResolvedValue({ sent: 0, errors: 0 }),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/listings/canonical-sync", () => ({
  syncCanonicalAvailability: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/profile-completion", () => ({
  calculateProfileCompletion: jest.fn().mockReturnValue({
    percentage: 100,
    missing: [],
    canCreateListing: true,
  }),
  PROFILE_REQUIREMENTS: {
    createListing: 60,
  },
}));

jest.mock("@/lib/listings/collision-detector", () => ({
  findCollisions: jest.fn(),
  checkCollisionRateLimit: jest.fn(),
}));

jest.mock("@/lib/search/search-telemetry", () => ({
  getOwnerHashPrefix8: jest.fn().mockReturnValue("deadbeef"),
  recordListingCreateCollisionBlocked: jest.fn(),
  recordListingCreateCollisionDetected: jest.fn(),
  recordListingCreateCollisionResolved: jest.fn(),
  recordListingCreateCollisionModerationGated: jest.fn(),
}));

jest.mock("@/lib/embeddings/sync", () => ({
  syncListingEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([key, value]) =>
          headersMap.set(key, value)
        );
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: headersMap,
      };
    },
  },
}));

import { POST } from "@/app/api/listings/route";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/geocoding";
import { prisma } from "@/lib/prisma";
import {
  checkCollisionRateLimit,
  findCollisions,
} from "@/lib/listings/collision-detector";
import {
  recordListingCreateCollisionBlocked,
  recordListingCreateCollisionDetected,
  recordListingCreateCollisionModerationGated,
  recordListingCreateCollisionResolved,
} from "@/lib/search/search-telemetry";
import { normalizeAddress } from "@/lib/search/normalize-address";

const mockSession = {
  user: { id: "user-123", name: "Test User", email: "test@example.com" },
};

const futureMoveInDate = new Date();
futureMoveInDate.setUTCDate(futureMoveInDate.getUTCDate() + 30);
const futureMoveInDateIso = futureMoveInDate.toISOString().slice(0, 10);

const validBody = {
  title: "Cozy Room in Downtown",
  description: "A nice place to stay with great amenities and city views",
  price: "800",
  amenities: "Wifi,AC",
  houseRules: "",
  address: "123 Main St",
  city: "San Francisco",
  state: "CA",
  zip: "94102",
  roomType: "Private Room",
  totalSlots: "1",
  moveInDate: futureMoveInDateIso,
  images: [
    "https://test-project.supabase.co/storage/v1/object/public/images/listings/user-123/test.jpg",
  ],
};

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/listings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createTx() {
  let createPayload: Record<string, unknown> | null = null;

  const tx = {
    listing: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        createPayload = data as Record<string, unknown>;
        return {
          id: "listing-new",
          title: data.title,
          description: data.description,
          price: data.price,
          roomType: data.roomType,
          leaseDuration: data.leaseDuration,
          amenities: data.amenities,
          houseRules: data.houseRules,
        };
      }),
    },
    location: {
      create: jest.fn().mockResolvedValue({ id: "loc-123" }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
  };

  return {
    tx,
    getCreatePayload: () => createPayload,
  };
}

describe("POST /api/listings collision flow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FEATURE_LISTING_CREATE_COLLISION_WARN: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
    } as NodeJS.ProcessEnv;

    (auth as jest.Mock).mockResolvedValue(mockSession);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-123" });
    (geocodeAddress as jest.Mock).mockResolvedValue({
      status: "success",
      lat: 37.7749,
      lng: -122.4194,
    });
    (findCollisions as jest.Mock).mockResolvedValue([]);
    (checkCollisionRateLimit as jest.Mock).mockResolvedValue({
      windowCount: 0,
      needsModeration: false,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("skips collision detection entirely when the feature flag is off", async () => {
    const { tx } = createTx();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(201);
    expect(findCollisions).not.toHaveBeenCalled();
    expect(checkCollisionRateLimit).not.toHaveBeenCalled();
  });

  it("returns 409 with sibling payload when collisions exist and no ack header is present", async () => {
    process.env.FEATURE_LISTING_CREATE_COLLISION_WARN = "true";
    const { tx } = createTx();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );
    (findCollisions as jest.Mock).mockResolvedValue([
      {
        id: "listing-existing",
        title: "Existing Listing",
        moveInDate: "2026-05-01",
        availableUntil: null,
        openSlots: 1,
        totalSlots: 1,
        createdAt: "2026-04-01T00:00:00.000Z",
        status: "ACTIVE",
        statusReason: null,
        canUpdate: true,
      },
    ]);

    const response = await POST(makeRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      error: "COLLISION_CANDIDATES",
      siblings: [
        expect.objectContaining({
          id: "listing-existing",
          title: "Existing Listing",
          canUpdate: true,
        }),
      ],
    });
    expect(recordListingCreateCollisionDetected).toHaveBeenCalledWith({
      ownerHashPrefix8: "deadbeef",
      siblingCount: 1,
    });
    expect(tx.listing.create).not.toHaveBeenCalled();
  });

  it("persists host-managed availability fields and normalizedAddress when create proceeds", async () => {
    process.env.FEATURE_LISTING_CREATE_COLLISION_WARN = "true";
    const { tx, getCreatePayload } = createTx();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );

    const response = await POST(
      makeRequest(validBody, {
        "x-collision-ack": "1",
      })
    );

    expect(response.status).toBe(201);
    expect(findCollisions).not.toHaveBeenCalled();
    expect(checkCollisionRateLimit).toHaveBeenCalledWith({
      ownerId: "user-123",
      normalizedAddress: normalizeAddress({
        address: validBody.address,
        city: validBody.city,
        state: validBody.state,
        zip: validBody.zip,
      }),
      tx,
    });
    expect(getCreatePayload()).toEqual(
      expect.objectContaining({
        normalizedAddress: normalizeAddress({
          address: validBody.address,
          city: validBody.city,
          state: validBody.state,
          zip: validBody.zip,
        }),
        openSlots: 1,
        availableSlots: 1,
        minStayMonths: 1,
        status: "ACTIVE",
        statusReason: null,
        lastConfirmedAt: expect.any(Date),
      })
    );
    expect(recordListingCreateCollisionResolved).toHaveBeenCalledWith({
      ownerHashPrefix8: "deadbeef",
      action: "proceed",
    });
  });

  it("blocks the fourth acked collision in 24 hours", async () => {
    process.env.FEATURE_LISTING_CREATE_COLLISION_WARN = "true";
    const { tx, getCreatePayload } = createTx();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );
    (checkCollisionRateLimit as jest.Mock).mockResolvedValue({
      windowCount: 3,
      needsModeration: true,
    });

    const response = await POST(
      makeRequest(validBody, {
        "x-collision-ack": "1",
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_CREATE_COLLISION_RATE_LIMITED",
    });
    expect(getCreatePayload()).toBeNull();
    expect(recordListingCreateCollisionModerationGated).toHaveBeenCalledWith({
      ownerHashPrefix8: "deadbeef",
      windowCount24h: 3,
    });
    expect(recordListingCreateCollisionBlocked).toHaveBeenCalledWith({
      ownerHashPrefix8: "deadbeef",
      windowCount24h: 3,
    });
    expect(recordListingCreateCollisionResolved).not.toHaveBeenCalled();
  });

  it("proceeds normally when the detector reports no same-owner collision", async () => {
    process.env.FEATURE_LISTING_CREATE_COLLISION_WARN = "true";
    const { tx } = createTx();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
      callback(tx)
    );
    (findCollisions as jest.Mock).mockResolvedValue([]);

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(201);
    expect(findCollisions).toHaveBeenCalled();
    expect(recordListingCreateCollisionDetected).not.toHaveBeenCalled();
  });
});
