import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendNotificationEmail } from "@/lib/email";
import { withRateLimit } from "@/lib/with-rate-limit";
import { captureApiError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/normalize-email";
import { createTokenPair } from "@/lib/token-security";
import { verifyTurnstileToken } from "@/lib/turnstile";

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128),
});

const DUPLICATE_REGISTRATION_ERROR =
  "Registration failed. Please try again or use forgot password if you already have an account.";

async function duplicateRegistrationResponse() {
  // Add artificial delay to match successful registration timing.
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 50));

  return NextResponse.json(
    { error: DUPLICATE_REGISTRATION_ERROR },
    { status: 400 }
  );
}

function isDuplicateRegistrationUniqueConstraintError(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  const rawTargets = (
    Array.isArray(target) ? target : typeof target === "string" ? [target] : []
  ).map((value) => String(value).toLowerCase());
  const targetTokens = rawTargets.flatMap((value) =>
    value.split(/[^a-z0-9]+/).filter(Boolean)
  );
  const tokenSet = new Set(targetTokens);
  const modelName =
    typeof error.meta?.modelName === "string"
      ? error.meta.modelName.toLowerCase()
      : undefined;

  const isUserEmailConstraint =
    tokenSet.has("email") &&
    (!modelName || modelName === "user" || tokenSet.has("user"));

  const isVerificationIdentifierConstraint =
    tokenSet.has("identifier") &&
    (modelName === "verificationtoken" ||
      tokenSet.has("verificationtoken") ||
      rawTargets.every((value) => value === "identifier"));

  return isUserEmailConstraint || isVerificationIdentifierConstraint;
}

export async function POST(request: Request) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // Rate limit: 5 registrations per hour per IP
  const rateLimitResponse = await withRateLimit(request, { type: "register" });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Verify Turnstile token before processing registration
    const { turnstileToken, ...registrationData } = body;
    const turnstileResult = await verifyTurnstileToken(turnstileToken);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: "Bot verification failed. Please try again." },
        { status: 403 }
      );
    }

    const result = registerSchema.safeParse(registrationData);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const field = firstIssue?.path[0];
      const messages: Record<string, string> = {
        name: "Name must be between 2 and 100 characters.",
        email: "Please enter a valid email address.",
        password:
          firstIssue?.message || "Password must be at least 12 characters.",
      };
      return NextResponse.json(
        {
          error:
            messages[field as string] ||
            "Invalid input. Please check your details and try again.",
        },
        { status: 400 }
      );
    }

    const { name, password } = result.data;
    const email = normalizeEmail(result.data.email);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // P1-06/P1-07 FIX: Prevent user enumeration with generic error message
    // and timing-safe delay to prevent timing attacks
    if (existingUser) {
      return duplicateRegistrationResponse();
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate token pair before transaction (pure computation)
    const { token: verificationToken, tokenHash: verificationTokenHash } =
      createTokenPair();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Atomic: create user + verification token in single transaction
    // Prevents orphaned users who can't verify email on partial failure
    try {
      await prisma.$transaction([
        prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            emailVerified: null,
          },
        }),
        prisma.verificationToken.create({
          data: {
            identifier: email,
            tokenHash: verificationTokenHash,
            expires,
          },
        }),
      ]);
    } catch (error) {
      if (isDuplicateRegistrationUniqueConstraintError(error)) {
        return duplicateRegistrationResponse();
      }

      throw error;
    }

    // Build verification URL
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const emailResult = await sendNotificationEmail("welcomeEmail", email, {
      userName: name,
      verificationUrl,
    });
    const verificationEmailSent = Boolean(emailResult?.success);
    if (!verificationEmailSent) {
      logger.sync.error("Failed to send welcome email", {
        route: "/api/register",
        method: "POST",
      });
    }

    // Return minimal response — do not leak user object fields to the client
    return NextResponse.json(
      { success: true, verificationEmailSent },
      { status: 201 }
    );
  } catch (error) {
    return captureApiError(error, { route: "/api/register", method: "POST" });
  }
}
