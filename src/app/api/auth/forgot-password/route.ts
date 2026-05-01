import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { normalizeEmail } from "@/lib/normalize-email";
import { createTokenPair } from "@/lib/token-security";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { validateCsrf } from "@/lib/csrf";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
  turnstileToken: z.string().min(1).max(4096),
});

const PASSWORD_RESET_ACCEPTED_MIN_RESPONSE_MS = 1000;
const PASSWORD_RESET_ACCEPTED_JITTER_MS = 250;

const passwordResetAcceptedResponse = () =>
  NextResponse.json({
    message:
      "If an account with that email exists, a password reset link has been sent.",
  });

function getPasswordResetAcceptedDelayMs() {
  return (
    PASSWORD_RESET_ACCEPTED_MIN_RESPONSE_MS +
    Math.floor(Math.random() * (PASSWORD_RESET_ACCEPTED_JITTER_MS + 1))
  );
}

async function waitForPasswordResetAcceptedTiming(
  startedAt: number,
  delayMs: number
) {
  const remainingMs = delayMs - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
}

async function passwordResetAcceptedAfterTiming(
  startedAt: number,
  delayMs: number
) {
  await waitForPasswordResetAcceptedTiming(startedAt, delayMs);
  return passwordResetAcceptedResponse();
}

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const ipRateLimitResponse = await withRateLimit(request, {
    type: "forgotPasswordByIp",
    endpoint: "forgotPasswordByIp",
  });
  if (ipRateLimitResponse) return ipRateLimitResponse;

  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Password reset is temporarily unavailable" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { email, turnstileToken } = parsed.data;
    const normalizedEmail = normalizeEmail(email);

    const turnstileResult = await verifyTurnstileToken(turnstileToken);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: "Bot verification failed. Please try again." },
        { status: 403 }
      );
    }

    const emailRateLimitResponse = await withRateLimit(request, {
      type: "forgotPassword",
      getIdentifier: () => normalizedEmail,
      endpoint: "forgotPasswordByEmail",
    });
    if (emailRateLimitResponse) return emailRateLimitResponse;

    const acceptedStartedAt = Date.now();
    const acceptedDelayMs = getPasswordResetAcceptedDelayMs();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true },
    });

    // Always return success to prevent email enumeration attacks
    if (!user) {
      return passwordResetAcceptedAfterTiming(
        acceptedStartedAt,
        acceptedDelayMs
      );
    }

    // Delete any existing reset tokens for this email
    await prisma.passwordResetToken.deleteMany({
      where: { email: normalizedEmail },
    });

    // Generate reset token and store only SHA-256 hash
    const { token, tokenHash } = createTokenPair();

    // Token expires in 1 hour
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    // Save the token
    await prisma.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        expires,
      },
    });

    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Log in development only (no PII — token is ephemeral)
    if (process.env.NODE_ENV === "development") {
      logger.sync.debug("Password reset link generated", {
        route: "/api/auth/forgot-password",
      });
    }

    after(async () => {
      try {
        const emailResult = await sendNotificationEmail(
          "passwordReset",
          normalizedEmail,
          {
            userName: user.name || "User",
            resetLink: resetUrl,
          }
        );
        if (emailResult?.success) {
          return;
        }
        logger.sync.error("Failed to send password reset email", {
          error: sanitizeErrorMessage(emailResult?.error),
          route: "/api/auth/forgot-password",
        });
      } catch (emailError) {
        logger.sync.error("Failed to send password reset email", {
          error: sanitizeErrorMessage(emailError),
          route: "/api/auth/forgot-password",
        });
      }
    });

    return passwordResetAcceptedAfterTiming(
      acceptedStartedAt,
      acceptedDelayMs
    );
  } catch (error) {
    logger.sync.error("Forgot password error", {
      error: sanitizeErrorMessage(error),
      route: "/api/auth/forgot-password",
    });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
