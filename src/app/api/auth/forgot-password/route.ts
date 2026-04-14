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

const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "If an account with that email exists, a password reset link has been sent.";
const FORGOT_PASSWORD_MIN_DURATION_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureForgotPasswordMinimumDuration(
  startedAt: number
): Promise<void> {
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = FORGOT_PASSWORD_MIN_DURATION_MS - elapsedMs;

  if (remainingMs > 0) {
    await sleep(remainingMs);
  }
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

    const successPathStartedAt = Date.now();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await ensureForgotPasswordMinimumDuration(successPathStartedAt);
      return NextResponse.json({
        message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
      });
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

    // In a production app, you would send an email here
    // For now, we'll log the reset link (in development) and return success
    const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${token}`;

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
        if (!emailResult.success) {
          logger.sync.error("Failed to send password reset email", {
            error: sanitizeErrorMessage(emailResult.error),
            route: "/api/auth/forgot-password",
          });
        }
      } catch (error) {
        logger.sync.error("Failed to send password reset email", {
          error: sanitizeErrorMessage(error),
          route: "/api/auth/forgot-password",
        });
      }
    });

    await ensureForgotPasswordMinimumDuration(successPathStartedAt);
    return NextResponse.json({
      message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
    });
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
