import crypto from "crypto";

const LOG_HMAC_SECRET = process.env.LOG_HMAC_SECRET || "";

export function hmacListingId(listingId: string): string {
  return crypto
    .createHmac("sha256", LOG_HMAC_SECRET)
    .update(listingId)
    .digest("hex")
    .slice(0, 16);
}

export function hasHmacSecret(): boolean {
  return LOG_HMAC_SECRET.length > 0;
}

// API-003 FIX: HMAC-signed view tokens to prevent view count inflation.
// Token = timestamp:hmac(timestamp:listingId)
const VIEW_TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export function generateViewToken(listingId: string): string {
  if (!LOG_HMAC_SECRET) return "";
  const timestamp = Date.now().toString(36);
  const sig = crypto
    .createHmac("sha256", LOG_HMAC_SECRET)
    .update(`${timestamp}:${listingId}`)
    .digest("hex")
    .slice(0, 16);
  return `${timestamp}:${sig}`;
}

export function validateViewToken(
  listingId: string,
  token: string | undefined
): boolean {
  if (!LOG_HMAC_SECRET) return true; // Graceful degradation: skip validation if no secret
  if (!token) return false;

  const sepIdx = token.indexOf(":");
  if (sepIdx === -1) return false;

  const timestamp = token.slice(0, sepIdx);
  const sig = token.slice(sepIdx + 1);

  // Check freshness
  const tokenAge = Date.now() - parseInt(timestamp, 36);
  if (isNaN(tokenAge) || tokenAge < 0 || tokenAge > VIEW_TOKEN_MAX_AGE_MS) {
    return false;
  }

  // Verify HMAC using timing-safe comparison
  const expectedSig = crypto
    .createHmac("sha256", LOG_HMAC_SECRET)
    .update(`${timestamp}:${listingId}`)
    .digest("hex")
    .slice(0, 16);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "utf8"),
      Buffer.from(expectedSig, "utf8")
    );
  } catch {
    return false;
  }
}
