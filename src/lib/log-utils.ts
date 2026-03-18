import { createHmac } from "crypto";

export function logSafeId(id: string): string {
  const secret = process.env.LOG_HMAC_SECRET;
  if (!secret) return `dev-${id.slice(0, 8)}`;
  return createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
}
