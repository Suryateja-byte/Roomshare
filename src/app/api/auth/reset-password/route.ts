import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withRateLimit } from "@/lib/with-rate-limit";
import { hashToken, isValidTokenFormat } from "@/lib/token-security";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { validateCsrf } from "@/lib/csrf";
import {
  invalidatePasswordState,
  preparePasswordUpdate,
  updateUserPassword,
} from "@/lib/password-security";
import * as Sentry from "@sentry/nextjs";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  // P0-02 FIX: Enforce same 12-char minimum as register endpoint
  password: z.string().min(12, "Password must be at least 12 characters"),
});

const RESET_LINK_INVALIDATED_ERROR =
  "This reset link is no longer valid. Please request a new one.";

type ResetValidationErrorCode =
  | "invalid"
  | "expired"
  | "stale"
  | "userNotFound";

type ResetValidationResult =
  | {
      ok: true;
      resetToken: {
        id: string;
        email: string;
        expires: Date;
        createdAt: Date;
      };
      user: {
        id: string;
        passwordChangedAt: Date | null;
      };
    }
  | {
      ok: false;
      code: ResetValidationErrorCode;
    };

async function validateResetToken(
  tokenHash: string,
  options: { deleteExpired?: boolean } = {}
): Promise<ResetValidationResult> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!resetToken) {
    return { ok: false, code: "invalid" };
  }

  if (resetToken.expires < new Date()) {
    if (options.deleteExpired) {
      await prisma.passwordResetToken.deleteMany({
        where: { id: resetToken.id },
      });
    }

    return { ok: false, code: "expired" };
  }

  const user = await prisma.user.findUnique({
    where: { email: resetToken.email },
    select: { id: true, passwordChangedAt: true },
  });

  if (!user) {
    return { ok: false, code: "userNotFound" };
  }

  if (
    user.passwordChangedAt &&
    user.passwordChangedAt.getTime() > resetToken.createdAt.getTime()
  ) {
    return { ok: false, code: "stale" };
  }

  return {
    ok: true,
    resetToken,
    user: {
      id: user.id,
      passwordChangedAt: user.passwordChangedAt ?? null,
    },
  };
}

function buildPostError(code: ResetValidationErrorCode) {
  switch (code) {
    case "expired":
      return NextResponse.json(
        { error: "Reset link has expired. Please request a new one." },
        { status: 400 }
      );
    case "stale":
      return NextResponse.json(
        { error: RESET_LINK_INVALIDATED_ERROR },
        { status: 400 }
      );
    case "userNotFound":
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    case "invalid":
    default:
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
  }
}

function buildGetError(code: ResetValidationErrorCode) {
  switch (code) {
    case "expired":
      return NextResponse.json(
        { valid: false, error: "Reset link has expired" },
        { status: 400 }
      );
    case "stale":
      return NextResponse.json(
        { valid: false, error: RESET_LINK_INVALIDATED_ERROR },
        { status: 400 }
      );
    case "userNotFound":
    case "invalid":
    default:
      return NextResponse.json(
        { valid: false, error: "Invalid reset link" },
        { status: 400 }
      );
  }
}

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // P1-2 FIX: Add rate limiting to prevent token brute-forcing
  const rateLimitResponse = await withRateLimit(request, {
    type: "resetPassword",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Validate input
    const result = resetPasswordSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { token, password } = result.data;
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);

    const validation = await validateResetToken(tokenHash, {
      deleteExpired: true,
    });
    if (!validation.ok) {
      return buildPostError(validation.code);
    }

    const passwordUpdate = await preparePasswordUpdate(password);

    // Atomic password reset: consume the token and write the new password
    // under one transaction so stale links cannot win a race.
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.passwordResetToken.deleteMany({
        where: { id: validation.resetToken.id },
      });
      if (deleted.count === 0) {
        throw new Error("RESET_LINK_INVALIDATED");
      }

      const liveUser = await tx.user.findUnique({
        where: { id: validation.user.id },
        select: { passwordChangedAt: true },
      });
      if (
        liveUser?.passwordChangedAt &&
        liveUser.passwordChangedAt.getTime() >
          validation.resetToken.createdAt.getTime()
      ) {
        throw new Error("RESET_LINK_INVALIDATED");
      }

      await updateUserPassword(tx, validation.user.id, passwordUpdate);
    });

    invalidatePasswordState(validation.user.id);

    return NextResponse.json({
      message: "Password has been reset successfully",
    });
  } catch (error) {
    // P0-2 FIX: Discriminate expected race condition from real errors
    if (error instanceof Error && error.message === "RESET_LINK_INVALIDATED") {
      return NextResponse.json(
        { error: RESET_LINK_INVALIDATED_ERROR },
        { status: 400 }
      );
    }

    logger.sync.error("Reset password error", {
      error: sanitizeErrorMessage(error),
      route: "/api/auth/reset-password",
    });
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}

// GET endpoint to verify token validity
export async function GET(request: NextRequest) {
  // Separate rate limit bucket for GET (token verification) vs POST (actual reset)
  const rateLimitResponse = await withRateLimit(request, {
    type: "resetPasswordVerify",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { valid: false, error: "Token is required" },
      { status: 400 }
    );
  }

  if (!isValidTokenFormat(token)) {
    return NextResponse.json(
      { valid: false, error: "Invalid reset link" },
      { status: 400 }
    );
  }

  const validation = await validateResetToken(hashToken(token));
  if (!validation.ok) {
    return buildGetError(validation.code);
  }

  return NextResponse.json({ valid: true });
}
