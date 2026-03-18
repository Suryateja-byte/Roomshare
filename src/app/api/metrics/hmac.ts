import crypto from 'crypto';

const LOG_HMAC_SECRET = process.env.LOG_HMAC_SECRET || '';

export function hmacListingId(listingId: string): string {
  return crypto.createHmac('sha256', LOG_HMAC_SECRET).update(listingId).digest('hex').slice(0, 16);
}

export function hasHmacSecret(): boolean {
  return LOG_HMAC_SECRET.length > 0;
}
