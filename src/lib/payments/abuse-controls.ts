import "server-only";

import { createHash, createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { getClientIP } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

type PaymentAbuseClient = Pick<
  typeof prisma,
  "paymentAbuseSignal"
>;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
]);

const CHECKOUT_SIGNAL_WINDOW_MS = 60 * 60 * 1000;
const CHECKOUT_SIGNAL_LIMIT = 10;

function hmacOrHash(value: string): string {
  const secret = process.env.LOG_HMAC_SECRET;
  if (secret && secret.length >= 32) {
    return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function normalizeEmailForAbuse(email: string | null | undefined): string {
  const normalized = (email ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) {
    return normalized;
  }

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  const plusIndex = local.indexOf("+");
  if (plusIndex >= 0) {
    local = local.slice(0, plusIndex);
  }

  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

export function isDisposableEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmailForAbuse(email);
  const domain = normalized.split("@")[1] ?? "";
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

function buildFingerprint(request: Request): string {
  return [
    request.headers.get("user-agent") ?? "",
    request.headers.get("accept-language") ?? "",
    request.headers.get("sec-ch-ua") ?? "",
  ].join("|");
}

async function countRecentSignal(
  client: PaymentAbuseClient,
  input: { signalKind: string; signalHash: string; now: Date }
) {
  const since = new Date(input.now.getTime() - CHECKOUT_SIGNAL_WINDOW_MS);
  return client.paymentAbuseSignal.count({
    where: {
      signalKind: input.signalKind,
      signalHash: input.signalHash,
      createdAt: { gt: since },
    },
  });
}

async function recordSignal(
  client: PaymentAbuseClient,
  input: {
    userId: string;
    signalKind: string;
    signalHash: string;
    reason: string;
    metadata?: Prisma.InputJsonObject;
  }
) {
  await client.paymentAbuseSignal.create({
    data: {
      userId: input.userId,
      signalKind: input.signalKind,
      signalHash: input.signalHash,
      reason: input.reason,
      metadata: input.metadata ?? {},
    },
  });
}

export async function evaluateCheckoutAbuse(
  client: PaymentAbuseClient,
  input: {
    userId: string;
    email?: string | null;
    request: Request;
    now?: Date;
  }
): Promise<
  | { allowed: true }
  | { allowed: false; status: 403 | 429; code: string; message: string }
> {
  const now = input.now ?? new Date();
  const normalizedEmail = normalizeEmailForAbuse(input.email);
  const ipHash = hmacOrHash(`ip:${getClientIP(input.request)}`);
  const fingerprintHash = hmacOrHash(`fp:${buildFingerprint(input.request)}`);
  const emailHash = hmacOrHash(`email:${normalizedEmail}`);

  if (isDisposableEmail(input.email)) {
    await recordSignal(client, {
      userId: input.userId,
      signalKind: "disposable_email",
      signalHash: emailHash,
      reason: "checkout_blocked",
    });
    return {
      allowed: false,
      status: 403,
      code: "DISPOSABLE_EMAIL",
      message: "Payments are unavailable for this account.",
    };
  }

  const [ipAttempts, fingerprintAttempts] = await Promise.all([
    countRecentSignal(client, {
      signalKind: "checkout_attempt_ip",
      signalHash: ipHash,
      now,
    }),
    countRecentSignal(client, {
      signalKind: "checkout_attempt_fingerprint",
      signalHash: fingerprintHash,
      now,
    }),
  ]);

  if (
    ipAttempts >= CHECKOUT_SIGNAL_LIMIT ||
    fingerprintAttempts >= CHECKOUT_SIGNAL_LIMIT
  ) {
    await recordSignal(client, {
      userId: input.userId,
      signalKind: "checkout_throttled",
      signalHash: ipAttempts >= CHECKOUT_SIGNAL_LIMIT ? ipHash : fingerprintHash,
      reason: "card_testing_window",
      metadata: {
        ipAttempts,
        fingerprintAttempts,
      },
    });
    return {
      allowed: false,
      status: 429,
      code: "PAYMENT_ABUSE_THROTTLED",
      message: "Too many payment attempts. Please try again later.",
    };
  }

  await Promise.all([
    recordSignal(client, {
      userId: input.userId,
      signalKind: "checkout_attempt_ip",
      signalHash: ipHash,
      reason: "checkout_attempt",
    }),
    recordSignal(client, {
      userId: input.userId,
      signalKind: "checkout_attempt_fingerprint",
      signalHash: fingerprintHash,
      reason: "checkout_attempt",
    }),
    normalizedEmail
      ? recordSignal(client, {
          userId: input.userId,
          signalKind: "abuse_normalized_email",
          signalHash: emailHash,
          reason: "checkout_attempt",
        })
      : Promise.resolve(),
  ]);

  return { allowed: true };
}
