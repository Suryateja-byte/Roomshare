import { NextResponse } from "next/server";
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
      // Add artificial delay to match successful registration timing
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 50)
      );
      return NextResponse.json(
        {
          error:
            "Registration failed. Please try again or use forgot password if you already have an account.",
        },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate token pair before transaction (pure computation)
    const { token: verificationToken, tokenHash: verificationTokenHash } =
      createTokenPair();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Atomic: create user + verification token in single transaction
    // Prevents orphaned users who can't verify email on partial failure
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

    // Build verification URL
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

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
