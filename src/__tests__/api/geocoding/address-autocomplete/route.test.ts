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
const mockSearchAddressSuggestions = jest.fn();

jest.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

jest.mock("@/lib/geocoding/address-autocomplete", () => {
  const actual = jest.requireActual("@/lib/geocoding/address-autocomplete");
  return {
    ...actual,
    searchAddressSuggestions: (...args: unknown[]) =>
      mockSearchAddressSuggestions(...args),
  };
});

import { GET } from "@/app/api/geocoding/address-autocomplete/route";

describe("/api/geocoding/address-autocomplete", () => {
  const requestFor = (queryString: string) =>
    new Request(
      `http://localhost/api/geocoding/address-autocomplete?${queryString}`
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    mockWithRateLimit.mockResolvedValue(null);
    mockSearchAddressSuggestions.mockResolvedValue([
      {
        id: "N:123",
        label: "1555 Market St, San Francisco, CA 94103",
        primaryText: "1555 Market St",
        secondaryText: "San Francisco, CA 94103",
        address: "1555 Market St",
        city: "San Francisco",
        state: "CA",
        zip: "94103",
        lat: 37.7749,
        lng: -122.4194,
        precision: "PREMISE",
        addressSuggestionToken: "signed-token",
      },
    ]);
  });

  it("requires authentication before returning private street-address suggestions", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await GET(requestFor("q=1555%20Market"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Unauthorized" });
    expect(mockSearchAddressSuggestions).not.toHaveBeenCalled();
  });

  it("uses IP and user+IP rate limits for authenticated requests", async () => {
    const response = await GET(requestFor("q=1555%20Market&limit=20"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.suggestions).toHaveLength(1);
    expect(mockWithRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      expect.objectContaining({
        type: "addressAutocomplete",
        endpoint: "/api/geocoding/address-autocomplete",
      })
    );
    expect(mockWithRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      expect.objectContaining({
        type: "addressAutocomplete",
        endpoint: "/api/geocoding/address-autocomplete/user",
      })
    );
    expect(mockSearchAddressSuggestions).toHaveBeenCalledWith("1555 Market", {
      limit: 10,
      userId: "user-123",
      sessionToken: "",
      selected: "",
    });
    expect(JSON.stringify(payload)).not.toContain("37.7749");
    expect(JSON.stringify(payload)).not.toContain("-122.4194");
    expect(JSON.stringify(payload)).not.toContain("signed-token");
  });

  it("passes a Places session token through to the private provider", async () => {
    const response = await GET(
      requestFor("q=1555%20Market&sessionToken=session_123")
    );

    expect(response.status).toBe(200);
    expect(mockSearchAddressSuggestions).toHaveBeenCalledWith("1555 Market", {
      limit: 5,
      userId: "user-123",
      sessionToken: "session_123",
      selected: "",
    });
  });

  it("passes Smarty secondary expansion selection through to the provider", async () => {
    const response = await GET(
      requestFor(
        "q=1042%20W%20Center%20St%20Apt&selected=1042%20W%20Center%20St%20Apt%20(108)%20Orem%20UT%2084057"
      )
    );

    expect(response.status).toBe(200);
    expect(mockSearchAddressSuggestions).toHaveBeenCalledWith(
      "1042 W Center St Apt",
      {
        limit: 5,
        userId: "user-123",
        sessionToken: "",
        selected: "1042 W Center St Apt (108) Orem UT 84057",
      }
    );
  });

  it("returns 422 for too-short queries without calling the provider", async () => {
    const response = await GET(requestFor("q=12"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({ code: "INVALID_QUERY" });
    expect(mockSearchAddressSuggestions).not.toHaveBeenCalled();
  });

  it("maps provider failures to an unavailable response without exposing query text", async () => {
    mockSearchAddressSuggestions.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(requestFor("q=1555%20Market"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ code: "UNAVAILABLE" });
    expect(JSON.stringify(payload)).not.toContain("1555 Market");
  });
});
