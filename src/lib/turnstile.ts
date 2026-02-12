/**
 * Server-side Cloudflare Turnstile verification
 *
 * Validates CAPTCHA tokens against Cloudflare's siteverify API.
 * Fails closed: network errors / timeouts → verification fails.
 * Kill switch: when TURNSTILE_ENABLED !== "true", bypasses all checks.
 */

import { logger } from "@/lib/logger";

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

interface TurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Check whether Turnstile is enabled (kill switch).
 * Returns true only if TURNSTILE_ENABLED=true AND the secret key is set.
 */
export function isTurnstileEnabled(): boolean {
  return (
    process.env.TURNSTILE_ENABLED === "true" &&
    !!process.env.TURNSTILE_SECRET_KEY
  );
}

/**
 * Verify a Turnstile token server-side.
 *
 * - If Turnstile is disabled (kill switch), returns `{ success: true }` immediately.
 * - If `token` is falsy, returns `{ success: false }`.
 * - On network error / timeout, fails closed (`{ success: false }`).
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteip?: string,
): Promise<TurnstileResult> {
  // Kill switch bypass
  if (!isTurnstileEnabled()) {
    return { success: true };
  }

  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY!;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
      ...(remoteip ? { remoteip } : {}),
    });

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      logger.sync.warn("Turnstile API returned non-OK status", {
        status: res.status,
      });
      return { success: false, errorCodes: ["http-error"] };
    }

    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };

    return {
      success: data.success,
      errorCodes: data["error-codes"],
    };
  } catch (error) {
    // Fail closed: any network/timeout error rejects the request
    logger.sync.warn("Turnstile verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, errorCodes: ["network-error"] };
  }
}
