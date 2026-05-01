import { after, NextResponse } from "next/server";
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

const REGISTRATION_ACCEPTED_MIN_RESPONSE_MS = 1000;
const REGISTRATION_ACCEPTED_JITTER_MS = 250;

const registrationAcceptedResponse = () =>
  NextResponse.json(
    { success: true, verificationEmailSent: true },
    { status: 201 }
  );

function getRegistrationAcceptedDelayMs() {
  return (
    REGISTRATION_ACCEPTED_MIN_RESPONSE_MS +
    Math.floor(Math.random() * (REGISTRATION_ACCEPTED_JITTER_MS + 1))
  );
}

async function waitForRegistrationAcceptedTiming(
  startedAt: number,
  delayMs: number
) {
  const remainingMs = delayMs - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
}

async function registrationAcceptedAfterTiming(
  startedAt: number,
  delayMs: number
) {
  await waitForRegistrationAcceptedTiming(startedAt, delayMs);
  return registrationAcceptedResponse();
}

function isPrismaUniqueConstraintError(error: unknown) {
  return (error as { code?: unknown })?.code === "P2002";
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
    const acceptedStartedAt = Date.now();
    const acceptedDelayMs = getRegistrationAcceptedDelayMs();

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Hash for every valid accepted attempt so existing-account requests do
    // comparable CPU work without creating users, tokens, or emails.
    const hashedPassword = await bcrypt.hash(password, 12);

    // Prevent user enumeration: valid existing and new emails get the same
    // accepted response shape/status. Do not churn tokens or send email here.
    if (existingUser) {
      return registrationAcceptedAfterTiming(acceptedStartedAt, acceptedDelayMs);
    }

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
      if (isPrismaUniqueConstraintError(error)) {
        return registrationAcceptedAfterTiming(
          acceptedStartedAt,
          acceptedDelayMs
        );
      }
      throw error;
    }

    // Build verification URL
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    after(async () => {
      try {
        const emailResult = await sendNotificationEmail("welcomeEmail", email, {
          userName: name,
          verificationUrl,
        });
        if (emailResult?.success) {
          return;
        }
      } catch {
        // Background email failures must not affect the accepted response.
      }
      logger.sync.error("Failed to send welcome email", {
        route: "/api/register",
        method: "POST",
      });
    });

    // Return a generic accepted response — do not leak account existence or
    // email delivery state to the client.
    return registrationAcceptedAfterTiming(acceptedStartedAt, acceptedDelayMs);
  } catch (error) {
    return captureApiError(error, { route: "/api/register", method: "POST" });
  }
}
