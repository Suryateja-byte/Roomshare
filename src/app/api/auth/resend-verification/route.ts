import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { normalizeEmail } from "@/lib/normalize-email";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { validateCsrf } from "@/lib/csrf";
import {
  clearPendingVerificationToken,
  prepareVerificationTokenRotation,
  promotePendingVerificationToken,
} from "@/lib/verification-token-store";
import * as Sentry from "@sentry/nextjs";

const RESEND_VERIFICATION_IN_PROGRESS_ERROR =
  "A verification email is already being prepared. Please wait a moment and try again if it doesn't arrive.";
const PRIVATE_NO_STORE = "private, no-store";

function withPrivateNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

function privateNoStoreJson(body: unknown, init?: ResponseInit) {
  return withPrivateNoStore(NextResponse.json(body, init));
}

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return withPrivateNoStore(csrfResponse);

  // Rate limit: 3 resend requests per hour
  const rateLimitResponse = await withRateLimit(request, {
    type: "resendVerification",
  });
  if (rateLimitResponse) return withPrivateNoStore(rateLimitResponse);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      return privateNoStoreJson(
        { error: "You must be logged in to resend verification email" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(session.user.email) },
    });

    if (!user) {
      return privateNoStoreJson({ error: "User not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return privateNoStoreJson(
        { error: "Email is already verified" },
        { status: 400 }
      );
    }

    const preparedToken = await prepareVerificationTokenRotation(user.email!);
    if (preparedToken.status === "conflict") {
      return privateNoStoreJson(
        { error: RESEND_VERIFICATION_IN_PROGRESS_ERROR },
        { status: 409 }
      );
    }

    // Build verification URL
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const verificationUrl = `${baseUrl}/verify-email?token=${preparedToken.token}`;

    // Send verification email
    const emailResult = await sendNotificationEmail(
      "emailVerification",
      user.email!,
      {
        userName: user.name || "User",
        verificationUrl,
      }
    );
    if (!emailResult.success) {
      try {
        await clearPendingVerificationToken(
          user.email!,
          preparedToken.tokenHash
        );
      } catch (cleanupError) {
        logger.sync.warn("Failed to clear pending verification token", {
          error: sanitizeErrorMessage(cleanupError),
          route: "/api/auth/resend-verification",
        });
      }

      return privateNoStoreJson(
        { error: "Email service temporarily unavailable" },
        { status: 503 }
      );
    }

    try {
      const promoted = await promotePendingVerificationToken(
        user.email!,
        preparedToken.tokenHash
      );

      if (!promoted) {
        logger.sync.warn("Verification token promotion skipped", {
          route: "/api/auth/resend-verification",
        });
      }
    } catch (promotionError) {
      logger.sync.warn("Failed to promote verification token", {
        error: sanitizeErrorMessage(promotionError),
        route: "/api/auth/resend-verification",
      });
      Sentry.captureException(promotionError);
    }

    return privateNoStoreJson({
      message: "Verification email sent successfully",
    });
  } catch (error) {
    logger.sync.error("Resend verification error", {
      error: sanitizeErrorMessage(error),
      route: "/api/auth/resend-verification",
    });
    Sentry.captureException(error);
    return privateNoStoreJson(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
