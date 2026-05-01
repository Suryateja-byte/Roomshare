import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { hashToken, isValidTokenFormat } from "@/lib/token-security";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { validateCsrf } from "@/lib/csrf";
import {
  clearVerificationTokenSlot,
  findVerificationTokenByHash,
} from "@/lib/verification-token-store";
import * as Sentry from "@sentry/nextjs";

async function clearExpiredVerificationToken(
  identifier: string,
  slot: "active" | "pending",
  tokenHash: string
) {
  try {
    await clearVerificationTokenSlot(identifier, slot, tokenHash);
  } catch (error) {
    logger.sync.warn("Failed to clear expired verification token", {
      error: sanitizeErrorMessage(error),
      route: "/api/auth/verify-email",
    });
  }
}

function verificationRedirectUrl(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const redirectUrl = new URL("/verify-email", request.url);

  if (token) {
    redirectUrl.searchParams.set("token", token);
  }

  return redirectUrl;
}

function buildVerificationError(
  code:
    | "missing_token"
    | "invalid_token"
    | "expired_token"
    | "user_not_found"
    | "verification_failed",
  error: string,
  status: number
) {
  return NextResponse.json(
    {
      status: "error",
      code,
      error,
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(verificationRedirectUrl(request));
}

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, {
    type: "verifyEmail",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as { token?: unknown };
    const token = typeof body?.token === "string" ? body.token : null;

    if (!token) {
      return buildVerificationError(
        "missing_token",
        "Verification token is required.",
        400
      );
    }

    if (!isValidTokenFormat(token)) {
      return buildVerificationError(
        "invalid_token",
        "This verification link is invalid or malformed.",
        400
      );
    }

    const tokenHash = hashToken(token);
    const verificationToken = await findVerificationTokenByHash(tokenHash);

    if (!verificationToken) {
      return buildVerificationError(
        "invalid_token",
        "This verification link is invalid or has already been replaced.",
        400
      );
    }

    if (verificationToken.expires < new Date()) {
      await clearExpiredVerificationToken(
        verificationToken.record.identifier,
        verificationToken.slot,
        tokenHash
      );
      return buildVerificationError(
        "expired_token",
        "This verification link has expired. Request a new one to continue.",
        400
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: verificationToken.record.identifier },
    });

    if (!user) {
      return buildVerificationError(
        "user_not_found",
        "We couldn't find an account for this verification link.",
        404
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const currentToken = await tx.verificationToken.findUnique({
          where: { identifier: verificationToken.record.identifier },
        });

        const currentHash =
          verificationToken.slot === "active"
            ? currentToken?.tokenHash
            : currentToken?.pendingTokenHash;
        const currentExpires =
          verificationToken.slot === "active"
            ? currentToken?.expires
            : currentToken?.pendingExpires;

        if (!currentToken) {
          throw new Error("TOKEN_ALREADY_USED");
        }

        if (currentHash !== tokenHash || !currentExpires) {
          throw new Error("TOKEN_INVALIDATED");
        }

        if (currentExpires < new Date()) {
          throw new Error("TOKEN_EXPIRED");
        }

        const deleted = await tx.verificationToken.deleteMany({
          where: { identifier: verificationToken.record.identifier },
        });
        if (deleted.count === 0) {
          throw new Error("TOKEN_ALREADY_USED");
        }

        await tx.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_ALREADY_USED") {
        return NextResponse.json({
          status: "already_verified",
          message: "This email address has already been verified.",
        });
      }

      if (error instanceof Error && error.message === "TOKEN_INVALIDATED") {
        return buildVerificationError(
          "invalid_token",
          "This verification link is no longer valid.",
          400
        );
      }

      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        await clearExpiredVerificationToken(
          verificationToken.record.identifier,
          verificationToken.slot,
          tokenHash
        );
        return buildVerificationError(
          "expired_token",
          "This verification link has expired. Request a new one to continue.",
          400
        );
      }

      throw error;
    }

    return NextResponse.json({
      status: "verified",
      message: "Your email address has been verified.",
    });
  } catch (error) {
    logger.sync.error("Email verification error", {
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
      route: "/api/auth/verify-email",
    });
    Sentry.captureException(error);
    return buildVerificationError(
      "verification_failed",
      "We couldn't verify your email. Please try again.",
      500
    );
  }
}
