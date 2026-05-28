/**
 * @jest-environment node
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headers.set(key, value);
        }
      }

      return {
        status: init?.status || 200,
        json: async () => data,
        headers: {
          get: (key: string) => headers.get(key),
          set: (key: string, value: string) => headers.set(key, value),
        },
      };
    },
  },
}));

const mockAuth = jest.fn();
const mockWithRateLimit = jest.fn();
const mockResolveAddressSuggestion = jest.fn();
const mockValidateSmartyAddressSuggestionForToken = jest.fn();

jest.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

jest.mock("@/lib/geocoding/google-places", () => {
  class GooglePlacesUnavailableError extends Error {
    constructor(
      message: string,
      public readonly code: "MISSING_KEY" | "TIMEOUT" | "UPSTREAM" | "CAPPED"
    ) {
      super(message);
    }
  }

  return {
    GooglePlacesUnavailableError,
    resolveAddressSuggestion: (...args: unknown[]) =>
      mockResolveAddressSuggestion(...args),
  };
});

jest.mock("@/lib/geocoding/smarty", () => {
  class SmartyAddressAutocompleteUnavailableError extends Error {
    constructor(
      message: string,
      public readonly code:
        | "MISSING_KEY"
        | "DISABLED"
        | "CAPPED"
        | "TIMEOUT"
        | "UPSTREAM"
    ) {
      super(message);
    }
  }

  return {
    SmartyAddressAutocompleteUnavailableError,
    validateSmartyAddressSuggestionForToken: (...args: unknown[]) =>
      mockValidateSmartyAddressSuggestionForToken(...args),
  };
});

import { POST } from "@/app/api/geocoding/address-details/route";

describe("/api/geocoding/address-details", () => {
  const requestFor = (body: Record<string, unknown>) =>
    new Request("http://localhost/api/geocoding/address-details", {
      method: "POST",
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    mockWithRateLimit.mockResolvedValue(null);
    mockValidateSmartyAddressSuggestionForToken.mockResolvedValue({
      id: "smarty:address",
      label: "1042 W Center St Apt A101, Orem, UT 84057",
      primaryText: "1042 W Center St Apt A101",
      secondaryText: "Orem, UT 84057",
      address: "1042 W Center St Apt A101",
      city: "Orem",
      state: "UT",
      zip: "84057",
      lat: 40.2969,
      lng: -111.6946,
      precision: "PREMISE",
      provider: "smarty",
      placeId: "smarty:address",
      requiresResolution: false,
      addressSuggestionToken: "encrypted-smarty-token",
    });
    mockResolveAddressSuggestion.mockResolvedValue({
      id: "google:ChIJAddress",
      label: "1121 Hidden Ridge, Irving, TX 75038",
      primaryText: "1121 Hidden Ridge",
      secondaryText: "Irving, TX 75038",
      address: "1121 Hidden Ridge",
      city: "Irving",
      state: "TX",
      zip: "75038",
      lat: 32.8765,
      lng: -96.9432,
      precision: "PREMISE",
      provider: "google",
      placeId: "ChIJAddress",
      requiresResolution: false,
      addressSuggestionToken: "signed-google-token",
    });
  });

  it("requires authentication before resolving private address details", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await POST(requestFor({ placeId: "ChIJAddress" }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(mockResolveAddressSuggestion).not.toHaveBeenCalled();
  });

  it("validates a selected Google address and returns a signed token", async () => {
    const response = await POST(
      requestFor({
        placeId: "ChIJAddress",
        sessionToken: "session_123",
        typedAddress: "1121 Hidden Ridge, Apt 1074",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.verificationStatus).toBe("trusted");
    expect(payload.suggestion.addressSuggestionToken).toBe(
      "signed-google-token"
    );
    expect(JSON.stringify(payload)).not.toContain("32.8765");
    expect(JSON.stringify(payload)).not.toContain("-96.9432");
    expect(mockResolveAddressSuggestion).toHaveBeenCalledWith("ChIJAddress", {
      userId: "user-123",
      sessionToken: "session_123",
      typedAddress: "1121 Hidden Ridge, Apt 1074",
    });
    expect(JSON.stringify(payload)).not.toContain("unit");
  });

  it("validates a complete Smarty selected address and returns a trusted token without coordinates", async () => {
    const response = await POST(
      requestFor({
        provider: "smarty",
        sourceId: "smarty:address",
        address: "1042 W Center St Apt A101",
        city: "Orem",
        state: "UT",
        zip: "84057",
        sessionToken: "session_123",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.verificationStatus).toBe("trusted");
    expect(payload.suggestion.addressSuggestionToken).toBe(
      "encrypted-smarty-token"
    );
    expect(mockValidateSmartyAddressSuggestionForToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        sourceId: "smarty:address",
        address: "1042 W Center St Apt A101",
        city: "Orem",
        state: "UT",
        zip: "84057",
        typedAddress: "1042 W Center St Apt A101",
        placeId: "smarty:address",
      })
    );
    expect(mockResolveAddressSuggestion).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain("40.2969");
    expect(JSON.stringify(payload)).not.toContain("-111.6946");
  });

  it("returns 422 when validation cannot produce a premise-level address", async () => {
    mockResolveAddressSuggestion.mockResolvedValueOnce(null);

    const response = await POST(requestFor({ placeId: "route-only" }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
  });
});
