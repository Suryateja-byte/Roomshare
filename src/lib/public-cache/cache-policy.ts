import { createHash, createHmac } from "crypto";

export interface PublicCacheFloorCursor {
  id: string;
  enqueuedAt: Date | string;
}

export interface SignedPublicCacheCursor {
  id: string;
  enqueuedAt: Date;
}

export class PublicCacheCursorError extends Error {
  constructor(message = "Invalid public cache cursor") {
    super(message);
    this.name = "PublicCacheCursorError";
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getPublicCacheSigningSecret(): string {
  const secret =
    process.env.PUBLIC_CACHE_CURSOR_SECRET ||
    process.env.PUBLIC_CACHE_KEY_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;

  if (secret && secret.length >= 16) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_CACHE_CURSOR_SECRET or AUTH_SECRET is required");
  }

  return "roomshare-dev-public-cache-cursor-secret";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getPublicCacheSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function buildPublicCacheFloorToken(
  latest: PublicCacheFloorCursor | null
): string {
  if (!latest) {
    return "none";
  }

  const enqueuedAtIso =
    latest.enqueuedAt instanceof Date
      ? latest.enqueuedAt.toISOString()
      : new Date(latest.enqueuedAt).toISOString();
  const idHash = createHash("sha256")
    .update(latest.id)
    .digest("hex")
    .slice(0, 12);

  return `v1:${enqueuedAtIso}:${idHash}`;
}

export function signPublicCacheCursor(
  cursor: PublicCacheFloorCursor | null
): string | null {
  if (!cursor) {
    return null;
  }

  const enqueuedAt =
    cursor.enqueuedAt instanceof Date
      ? cursor.enqueuedAt.toISOString()
      : new Date(cursor.enqueuedAt).toISOString();
  const payload = base64UrlEncode(JSON.stringify({ id: cursor.id, enqueuedAt }));
  return `v1.${payload}.${signPayload(payload)}`;
}

export function parsePublicCacheCursorToken(
  token: string | null | undefined
): SignedPublicCacheCursor | null {
  if (!token || token.trim().length === 0) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new PublicCacheCursorError();
  }

  const [, payload, signature] = parts;
  if (signature !== signPayload(payload)) {
    throw new PublicCacheCursorError();
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      id?: unknown;
      enqueuedAt?: unknown;
    };
    if (
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      typeof parsed.enqueuedAt !== "string"
    ) {
      throw new PublicCacheCursorError();
    }

    const enqueuedAt = new Date(parsed.enqueuedAt);
    if (Number.isNaN(enqueuedAt.getTime())) {
      throw new PublicCacheCursorError();
    }

    return { id: parsed.id, enqueuedAt };
  } catch (error) {
    if (error instanceof PublicCacheCursorError) {
      throw error;
    }
    throw new PublicCacheCursorError();
  }
}

export function buildPublicUnitCacheKey(
  unitId: string,
  unitIdentityEpoch: number
): string {
  const digest = createHash("sha256")
    .update(
      `${getPublicCacheSigningSecret()}:unit:${unitId}:${unitIdentityEpoch}`
    )
    .digest("hex")
    .slice(0, 24);
  return `u1:${digest}`;
}

export function normalizeCacheInvalidationReason(reason: string): string {
  const normalized = reason.trim().toUpperCase();
  if (normalized.includes("TOMBSTONE") || normalized.includes("SUPPRESS")) {
    return "TOMBSTONE";
  }
  if (normalized.includes("IDENTITY")) {
    return "IDENTITY_MUTATION";
  }
  if (normalized.includes("REPUBLICATION") || normalized.includes("REPUBLISH")) {
    return "REPUBLISH";
  }
  return "PUBLIC_CACHE_INVALIDATE";
}

export function isDynamicPublicNavigationPath(pathname: string): boolean {
  return pathname === "/search" || pathname.startsWith("/listings/");
}

export function shouldBypassServiceWorkerCache(
  cacheControl: string | null | undefined
): boolean {
  if (!cacheControl) {
    return false;
  }

  const normalized = cacheControl.toLowerCase();
  return normalized.includes("no-store") || normalized.includes("private");
}
