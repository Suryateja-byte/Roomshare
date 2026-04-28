import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { revealHostPhoneForListing } from "@/lib/contact/phone-reveal";
import { validateCsrf } from "@/lib/csrf";
import { checkEmailVerified, checkSuspension } from "@/app/actions/suspension";

export const runtime = "nodejs";

const phoneRevealRequestSchema = z.object({
  listingId: z.string().trim().min(1).max(100),
  clientIdempotencyKey: z.string().trim().min(1).max(200).optional(),
  unitIdentityEpochObserved: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized", code: "SESSION_EXPIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ip = getClientIPFromHeaders(request.headers);
  const rateLimit = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "phoneReveal",
    RATE_LIMITS.phoneReveal
  );
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: "Phone reveal is unavailable right now.",
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  const suspension = await checkSuspension(session.user.id);
  if (suspension.suspended) {
    return NextResponse.json(
      {
        error: suspension.error || "Account suspended",
        code: "ACCOUNT_SUSPENDED",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const emailCheck = await checkEmailVerified(session.user.id);
  if (!emailCheck.verified) {
    return NextResponse.json(
      {
        error: emailCheck.error || "Please verify your email to continue",
        code: "EMAIL_VERIFICATION_REQUIRED",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = phoneRevealRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid phone reveal payload", code: "INVALID_PAYLOAD" },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await revealHostPhoneForListing({
    viewerUserId: session.user.id,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      phoneNumber: result.phoneNumber,
      phoneLast4: result.phoneLast4,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
