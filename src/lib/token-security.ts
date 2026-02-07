import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createTokenPair(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export function isValidTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
