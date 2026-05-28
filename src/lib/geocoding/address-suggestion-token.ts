import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { splitTrailingAddressUnit } from "@/lib/geocoding/address-suggestion-utils";

export type AddressSuggestionProvider = "photon" | "google" | "smarty";
export type AddressSuggestionPrecision = "PREMISE" | "STREET";

export interface AddressSuggestionTokenPayload {
  provider: AddressSuggestionProvider;
  precision: AddressSuggestionPrecision;
  sourceId: string;
  userId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  issuedAt: number;
  expiresAt: number;
}

export type AddressSuggestionTokenFailureReason =
  | "malformed"
  | "signature_mismatch"
  | "expired"
  | "provider_untrusted"
  | "precision_untrusted"
  | "user_mismatch"
  | "field_mismatch"
  | "invalid_coordinates";

export type AddressSuggestionTokenVerificationResult =
  | {
      valid: true;
      payload: AddressSuggestionTokenPayload;
      coords: { lat: number; lng: number };
    }
  | { valid: false; reason: AddressSuggestionTokenFailureReason };

export interface AddressSuggestionTokenVerificationInput {
  userId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  now?: number;
}

const LEGACY_SIGNED_TOKEN_VERSION = "v1";
const ENCRYPTED_TOKEN_VERSION = "v2";
const DEFAULT_DEV_SECRET = "development-address-suggestion-token-secret-32";

function getSigningSecret(): string {
  const secret =
    process.env.ADDRESS_SUGGESTION_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADDRESS_SUGGESTION_TOKEN_SECRET or AUTH_SECRET is required in production"
    );
  }

  return DEFAULT_DEV_SECRET;
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function base64UrlDecodeBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(getSigningSecret()).digest();
}

function sign(value: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(value)
    .digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function normalizeField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function fieldsMatch(
  payload: AddressSuggestionTokenPayload,
  input: AddressSuggestionTokenVerificationInput
): boolean {
  const submittedAddress = normalizeField(input.address);
  const tokenAddress = normalizeField(payload.address);
  const submittedAddressWithoutUnit = splitTrailingAddressUnit(
    input.address
  ).baseAddress;
  const addressMatches =
    tokenAddress === submittedAddress ||
    (submittedAddressWithoutUnit !== input.address.trim() &&
      tokenAddress === normalizeField(submittedAddressWithoutUnit));

  return (
    addressMatches &&
    normalizeField(payload.city) === normalizeField(input.city) &&
    normalizeField(payload.state) === normalizeField(input.state) &&
    normalizeField(payload.zip) === normalizeField(input.zip)
  );
}

function hasValidCoordinates(payload: AddressSuggestionTokenPayload): boolean {
  return (
    Number.isFinite(payload.lat) &&
    Number.isFinite(payload.lng) &&
    payload.lat >= -90 &&
    payload.lat <= 90 &&
    payload.lng >= -180 &&
    payload.lng <= 180 &&
    !(payload.lat === 0 && payload.lng === 0)
  );
}

function isPayload(value: unknown): value is AddressSuggestionTokenPayload {
  const payload = value as Partial<AddressSuggestionTokenPayload>;
  return (
    (payload.provider === "photon" ||
      payload.provider === "google" ||
      payload.provider === "smarty") &&
    (payload.precision === "PREMISE" || payload.precision === "STREET") &&
    typeof payload.sourceId === "string" &&
    typeof payload.userId === "string" &&
    typeof payload.address === "string" &&
    typeof payload.city === "string" &&
    typeof payload.state === "string" &&
    typeof payload.zip === "string" &&
    typeof payload.lat === "number" &&
    typeof payload.lng === "number" &&
    typeof payload.issuedAt === "number" &&
    typeof payload.expiresAt === "number"
  );
}

export function signAddressSuggestionToken(
  payload: AddressSuggestionTokenPayload
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(ENCRYPTED_TOKEN_VERSION, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_TOKEN_VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

function parseLegacySignedToken(
  parts: string[]
):
  | { ok: true; payload: AddressSuggestionTokenPayload }
  | { ok: false; reason: AddressSuggestionTokenFailureReason } {
  if (parts.length !== 3 || parts[0] !== LEGACY_SIGNED_TOKEN_VERSION) {
    return { ok: false, reason: "malformed" };
  }

  const [, encodedPayload, actualSignature] = parts as [
    string,
    string,
    string,
  ];
  const unsignedToken = `${LEGACY_SIGNED_TOKEN_VERSION}.${encodedPayload}`;
  const expectedSignature = sign(unsignedToken);
  if (!signaturesMatch(actualSignature, expectedSignature)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!isPayload(parsed)) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, payload: parsed };
}

function parseEncryptedToken(
  parts: string[]
):
  | { ok: true; payload: AddressSuggestionTokenPayload }
  | { ok: false; reason: AddressSuggestionTokenFailureReason } {
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_TOKEN_VERSION) {
    return { ok: false, reason: "malformed" };
  }

  try {
    const [, encodedIv, encodedEncrypted, encodedTag] = parts as [
      string,
      string,
      string,
      string,
    ];
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      base64UrlDecodeBuffer(encodedIv)
    );
    decipher.setAAD(Buffer.from(ENCRYPTED_TOKEN_VERSION, "utf8"));
    decipher.setAuthTag(base64UrlDecodeBuffer(encodedTag));
    const decrypted = Buffer.concat([
      decipher.update(base64UrlDecodeBuffer(encodedEncrypted)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as unknown;

    if (!isPayload(parsed)) {
      return { ok: false, reason: "malformed" };
    }

    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, reason: "signature_mismatch" };
  }
}

export function verifyAddressSuggestionToken(
  token: string | null | undefined,
  input: AddressSuggestionTokenVerificationInput
): AddressSuggestionTokenVerificationResult {
  if (!token) {
    return { valid: false, reason: "malformed" };
  }

  const parts = token.split(".");
  const parsed =
    parts[0] === ENCRYPTED_TOKEN_VERSION
      ? parseEncryptedToken(parts)
      : parseLegacySignedToken(parts);
  if (!parsed.ok) {
    return { valid: false, reason: parsed.reason };
  }

  const payload = parsed.payload;
  const now = input.now ?? Date.now();

  if (payload.expiresAt < now) {
    return { valid: false, reason: "expired" };
  }
  if (
    payload.provider !== "photon" &&
    payload.provider !== "google" &&
    payload.provider !== "smarty"
  ) {
    return { valid: false, reason: "provider_untrusted" };
  }
  if (payload.precision !== "PREMISE") {
    return { valid: false, reason: "precision_untrusted" };
  }
  if (payload.userId !== input.userId) {
    return { valid: false, reason: "user_mismatch" };
  }
  if (!fieldsMatch(payload, input)) {
    return { valid: false, reason: "field_mismatch" };
  }
  if (!hasValidCoordinates(payload)) {
    return { valid: false, reason: "invalid_coordinates" };
  }

  return {
    valid: true,
    payload,
    coords: {
      lat: payload.lat,
      lng: payload.lng,
    },
  };
}
