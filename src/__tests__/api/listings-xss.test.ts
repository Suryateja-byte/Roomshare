/**
 * XSS / injection tests for POST /api/listings
 *
 * Verifies that:
 *   - HTML tags in title/description are rejected by Zod's noHtmlTags refine
 *   - SQL injection payloads in text fields are rejected (contain '<' or '>')
 *     or are harmless (no raw SQL execution on user strings)
 *   - Boundary-length strings are rejected by Zod max constraints
 */

jest.mock("server-only", () => ({}));

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
      error: jest.fn(),
      warn: jest.fn(),
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
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/schemas", () => {
  const actual = jest.requireActual("@/lib/schemas");
  return actual;
});

jest.mock("@/lib/profile-completion", () => ({
  calculateProfileCompletion: jest.fn().mockReturnValue({
    percentage: 100,
    missing: [],
    canCreateListing: true,
    canSendMessages: true,
    canBookRooms: true,
  }),
  PROFILE_REQUIREMENTS: {
    createListing: 60,
    sendMessages: 40,
    bookRooms: 80,
  },
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v));
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
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/geocoding";
import { checkSuspension, checkEmailVerified } from "@/app/actions/suspension";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSession = {
  user: { id: "user-123", name: "Test User", email: "test@example.com" },
};

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
  images: [
    "https://test-project.supabase.co/storage/v1/object/public/images/listings/user-123/test.jpg",
  ],
};

const mockListing = {
  id: "listing-new",
  title: "Cozy Room in Downtown",
  description: "A nice place to stay with great amenities and city views",
  price: 800,
  roomType: "Private Room",
  leaseDuration: null,
  amenities: ["Wifi", "AC"],
  houseRules: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/listings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockSuccessfulTransaction() {
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
    const tx = {
      listing: { create: jest.fn().mockResolvedValue(mockListing) },
      location: { create: jest.fn().mockResolvedValue({ id: "loc-123" }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
    };
    return callback(tx);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/listings — XSS / injection / boundary tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (checkEmailVerified as jest.Mock).mockResolvedValue({ verified: true });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "user-123" });
    (prisma.listing.count as jest.Mock).mockResolvedValue(0);
    (geocodeAddress as jest.Mock).mockResolvedValue({
      status: "success",
      lat: 37.7749,
      lng: -122.4194,
    });
  });

  // =========================================================================
  // 1. XSS in title
  // =========================================================================

  describe("XSS in title", () => {
    it('rejects <script>alert("xss")</script> in title', async () => {
      const response = await POST(
        makeRequest({ ...validBody, title: '<script>alert("xss")</script>' })
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.fields?.title).toBeDefined();
    });

    it("rejects <SCRIPT>alert(1)</SCRIPT> (uppercase) in title", async () => {
      const response = await POST(
        makeRequest({ ...validBody, title: "<SCRIPT>alert(1)</SCRIPT>" })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <img src=x onerror=alert(1)> in title", async () => {
      const response = await POST(
        makeRequest({ ...validBody, title: "<img src=x onerror=alert(1)>" })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <svg onload=alert(1)> in title", async () => {
      const response = await POST(
        makeRequest({ ...validBody, title: "<svg onload=alert(1)>" })
      );
      expect(response.status).toBe(400);
    });

    it('rejects <a href="javascript:alert(1)">click</a> in title', async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          title: '<a href="javascript:alert(1)">click</a>',
        })
      );
      expect(response.status).toBe(400);
    });

    it('rejects <div style="background:url(javascript:alert(1))"> in title', async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          title: '<div style="background:url(javascript:alert(1))">',
        })
      );
      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // 2. XSS in description
  // =========================================================================

  describe("XSS in description", () => {
    it("rejects <img onerror=alert(1)> in description", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          description: "Nice room <img onerror=alert(1)> with a view",
        })
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.fields?.description).toBeDefined();
    });

    it("rejects <script>document.cookie</script> in description", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          description: "Great spot <script>document.cookie</script> downtown",
        })
      );
      expect(response.status).toBe(400);
    });

    it('rejects <iframe src="evil.com"> in description', async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          description:
            'Spacious room <iframe src="evil.com"></iframe> for rent',
        })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <body onload=alert(1)> in description", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          description: "A lovely room <body onload=alert(1)> and sunshine",
        })
      );
      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // 3. SQL injection attempts
  // =========================================================================

  describe("SQL injection in title", () => {
    it("allows SQL-like strings that do not contain HTML tags", async () => {
      // SQL injection payloads without angle brackets pass HTML check
      // but are safe because Prisma uses parameterized queries
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          title: "'; DROP TABLE Listing; --",
        })
      );
      // This should succeed because the noHtmlTags check only rejects HTML tags.
      // SQL injection is neutralized by Prisma's parameterized queries.
      expect(response.status).toBe(201);
    });

    it("allows OR 1=1 style injection (no HTML, neutralized by Prisma)", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          title: "' OR '1'='1' --",
        })
      );
      expect(response.status).toBe(201);
    });

    it("allows UNION SELECT injection (no HTML, neutralized by Prisma)", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          title: "' UNION SELECT * FROM users --",
        })
      );
      expect(response.status).toBe(201);
    });
  });

  // =========================================================================
  // 4. Boundary-length string tests (Zod max validation)
  // =========================================================================

  describe("boundary-length strings", () => {
    it("rejects title with 101 characters", async () => {
      const longTitle = "A".repeat(101);
      const response = await POST(
        makeRequest({ ...validBody, title: longTitle })
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.fields?.title).toBeDefined();
    });

    it("accepts title with exactly 100 characters", async () => {
      mockSuccessfulTransaction();
      const title100 = "A".repeat(100);
      const response = await POST(
        makeRequest({ ...validBody, title: title100 })
      );
      expect(response.status).toBe(201);
    });

    it("rejects description with 1001 characters", async () => {
      const longDesc = "A".repeat(1001);
      const response = await POST(
        makeRequest({ ...validBody, description: longDesc })
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.fields?.description).toBeDefined();
    });

    it("accepts description with exactly 1000 characters", async () => {
      mockSuccessfulTransaction();
      const desc1000 = "A".repeat(1000);
      const response = await POST(
        makeRequest({ ...validBody, description: desc1000 })
      );
      expect(response.status).toBe(201);
    });

    it("rejects empty title", async () => {
      const response = await POST(makeRequest({ ...validBody, title: "" }));
      expect(response.status).toBe(400);
    });

    it("rejects description shorter than 10 characters", async () => {
      const response = await POST(
        makeRequest({ ...validBody, description: "Short" })
      );
      expect(response.status).toBe(400);
    });
  });

  // =========================================================================
  // 5. Mixed injection payloads
  // =========================================================================

  describe("mixed injection payloads", () => {
    it("rejects title with embedded script and SQL", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          title: "<script>'; DROP TABLE Listing; --</script>",
        })
      );
      expect(response.status).toBe(400);
    });

    it("rejects description with encoded HTML entities as literal tags", async () => {
      // Literal angle brackets in the string
      const response = await POST(
        makeRequest({
          ...validBody,
          description:
            "Great room <marquee>scrolling text</marquee> for rent today",
        })
      );
      expect(response.status).toBe(400);
    });

    it("allows safe special characters in title", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          title: "Cozy Room — $800/mo, near bus stop (2BR)",
        })
      );
      expect(response.status).toBe(201);
    });

    it("allows ampersands and quotes in title (no HTML tags)", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          title: 'Room & Board - "Best Deal" in Town',
        })
      );
      expect(response.status).toBe(201);
    });
  });

  // =========================================================================
  // P0-5: XSS in address, city, state fields
  // =========================================================================

  describe("XSS in address field", () => {
    it("rejects <script> tag in address", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          address: '<script>alert("xss")</script>',
        })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <img onerror> in address", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          address: "<img src=x onerror=alert(1)>",
        })
      );
      expect(response.status).toBe(400);
    });

    it("allows normal address with special characters", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          address: "123 O'Brien St, Apt #4B",
        })
      );
      expect(response.status).toBe(201);
    });

    it("allows international address with accented characters", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          address: "123 Rue de Café, São Paulo",
        })
      );
      expect(response.status).toBe(201);
    });
  });

  describe("XSS in city field", () => {
    it("rejects <script> tag in city", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          city: '<script>alert("xss")</script>',
        })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <img onerror> in city", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          city: "<img src=x onerror=alert(1)>",
        })
      );
      expect(response.status).toBe(400);
    });

    it("allows city with accented characters", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          city: "San José",
        })
      );
      expect(response.status).toBe(201);
    });
  });

  describe("XSS in state field", () => {
    it("rejects <script> tag in state", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          state: "<script>alert(1)</script>",
        })
      );
      expect(response.status).toBe(400);
    });

    it("rejects <svg onload> in state", async () => {
      const response = await POST(
        makeRequest({
          ...validBody,
          state: "<svg onload=alert(1)>",
        })
      );
      expect(response.status).toBe(400);
    });

    it("allows normal state abbreviations", async () => {
      mockSuccessfulTransaction();
      const response = await POST(
        makeRequest({
          ...validBody,
          state: "CA",
        })
      );
      expect(response.status).toBe(201);
    });
  });
});
