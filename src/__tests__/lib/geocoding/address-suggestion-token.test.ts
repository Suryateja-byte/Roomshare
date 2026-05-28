import { createHmac } from "node:crypto";
import {
  signAddressSuggestionToken,
  verifyAddressSuggestionToken,
  type AddressSuggestionTokenPayload,
} from "@/lib/geocoding/address-suggestion-token";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";

const basePayload: AddressSuggestionTokenPayload = {
  provider: "google",
  precision: "PREMISE",
  sourceId: "N:123",
  userId: "user-123",
  address: "1555 Market St",
  city: "San Francisco",
  state: "CA",
  zip: "94103",
  lat: 37.7749,
  lng: -122.4194,
  issuedAt: 1_000_000,
  expiresAt: 1_060_000,
};

function signLegacyAddressSuggestionToken(
  payload: AddressSuggestionTokenPayload
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const unsignedToken = `v1.${encodedPayload}`;
  const signature = createHmac("sha256", TEST_SECRET)
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
}

describe("address suggestion tokens", () => {
  const originalSecret = process.env.ADDRESS_SUGGESTION_TOKEN_SECRET;

  beforeEach(() => {
    process.env.ADDRESS_SUGGESTION_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.ADDRESS_SUGGESTION_TOKEN_SECRET;
    } else {
      process.env.ADDRESS_SUGGESTION_TOKEN_SECRET = originalSecret;
    }
  });

  it("round-trips an encrypted premise-level suggestion when submitted fields match", () => {
    const token = signAddressSuggestionToken(basePayload);

    expect(token.split(".")).toHaveLength(4);
    expect(token.startsWith("v2.")).toBe(true);
    expect(token).not.toContain("1555");
    expect(token).not.toContain("-122.4194");

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
      expect(result.payload.precision).toBe("PREMISE");
    }
  });

  it("trusts Smarty premise tokens produced after server-side validation", () => {
    const token = signAddressSuggestionToken({
      ...basePayload,
      provider: "smarty",
      sourceId: "smarty:address",
    });

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.provider).toBe("smarty");
      expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
    }
  });

  it("accepts legacy signed tokens until their embedded expiry", () => {
    const token = signLegacyAddressSuggestionToken({
      ...basePayload,
      provider: "photon",
      sourceId: "N:123",
    });

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.provider).toBe("photon");
      expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
    }
  });

  it("rejects tokens issued for a different host user", () => {
    const token = signAddressSuggestionToken(basePayload);

    const result = verifyAddressSuggestionToken(token, {
      userId: "other-user",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result).toEqual({ valid: false, reason: "user_mismatch" });
  });

  it("rejects a token when the host edits the address after selecting it", () => {
    const token = signAddressSuggestionToken(basePayload);

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market Street Apt 4",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result).toEqual({ valid: false, reason: "field_mismatch" });
  });

  it("accepts a selected premise token when the submitted address adds a trailing unit", () => {
    const token = signAddressSuggestionToken(basePayload);

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market St, Apt 4",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
    }
  });

  it("rejects a selected premise token when the submitted base street changes before the unit", () => {
    const token = signAddressSuggestionToken(basePayload);

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market Street, Apt 4",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result).toEqual({ valid: false, reason: "field_mismatch" });
  });

  it("rejects expired tokens", () => {
    const token = signAddressSuggestionToken(basePayload);

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_060_001,
    });

    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects tampered tokens", () => {
    const token = signAddressSuggestionToken(basePayload);
    const parts = token.split(".");
    parts[2] = `${parts[2].startsWith("a") ? "b" : "a"}${parts[2].slice(1)}`;
    const tampered = parts.join(".");

    const result = verifyAddressSuggestionToken(tampered, {
      userId: "user-123",
      address: "1555 Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects street-level suggestions as verified coordinates", () => {
    const token = signAddressSuggestionToken({
      ...basePayload,
      precision: "STREET",
    });

    const result = verifyAddressSuggestionToken(token, {
      userId: "user-123",
      address: "Market St",
      city: "San Francisco",
      state: "CA",
      zip: "94103",
      now: 1_030_000,
    });

    expect(result).toEqual({ valid: false, reason: "precision_untrusted" });
  });
});
