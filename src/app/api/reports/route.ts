import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { features } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { captureApiError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/csrf";
import {
  ACTIVE_REPORT_STATUSES,
  PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH,
  PRIVATE_FEEDBACK_DISABLED_CODE,
  REPORT_KINDS,
  REPORT_REASON_MAX_LENGTH,
  REPORT_TARGET_USER_MAX_LENGTH,
  isPrivateFeedbackCategory,
  isPrivateFeedbackKind,
} from "@/lib/reports/private-feedback";
import {
  recordPrivateFeedbackDenied,
  recordPrivateFeedbackSubmission,
} from "@/lib/reports/private-feedback-telemetry";
import { z } from "zod";

// P2-5: Zod schema for request validation
const createReportSchema = z
  .object({
    listingId: z.string().min(1, "listingId is required").max(100),
    reason: z.string().min(1, "reason is required").max(REPORT_REASON_MAX_LENGTH),
    details: z.string().max(PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH).optional(),
    kind: z.enum(REPORT_KINDS).default("ABUSE_REPORT"),
    targetUserId: z
      .string()
      .min(1, "targetUserId is required")
      .max(REPORT_TARGET_USER_MAX_LENGTH)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!isPrivateFeedbackKind(data.kind)) {
      return;
    }

    if (!isPrivateFeedbackCategory(data.reason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Invalid private feedback category",
      });
    }

    if (!data.details?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["details"],
        message: "details is required",
      });
    }

    if (!data.targetUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetUserId"],
        message: "targetUserId is required",
      });
    }
  });

export async function POST(request: Request) {
  let previewKind: "PRIVATE_FEEDBACK" | null = null;
  let previewListingId: string | undefined;
  let previewTargetUserId: string | undefined;

  try {
    const preview = (await request.clone().json()) as Record<string, unknown>;
    previewKind =
      preview.kind === "PRIVATE_FEEDBACK" ? "PRIVATE_FEEDBACK" : null;
    previewListingId =
      typeof preview.listingId === "string" ? preview.listingId : undefined;
    previewTargetUserId =
      typeof preview.targetUserId === "string" ? preview.targetUserId : undefined;
  } catch {
    // Ignore preview parse failures. The normal validation path handles them.
  }

  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  // P2-5: Add rate limiting to prevent report spam
  const rateLimitResponse = await withRateLimit(request, {
    type: "createReport",
  });
  if (rateLimitResponse) {
    if (previewKind === "PRIVATE_FEEDBACK") {
      recordPrivateFeedbackDenied({
        reason: "rate_limit",
        listingId: previewListingId,
        targetUserId: previewTargetUserId,
      });
    }
    return rateLimitResponse;
  }

  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // P2-5: Zod validation
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { listingId, reason, details, kind, targetUserId } = parsed.data;
    const isPrivateFeedback = isPrivateFeedbackKind(kind);

    // BIZ-05: Block self-reporting — look up listing owner
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.ownerId === session.user.id) {
      if (isPrivateFeedback) {
        recordPrivateFeedbackDenied({
          reason: "self_target",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
      }
      return NextResponse.json(
        { error: "You cannot report your own listing" },
        { status: 400 }
      );
    }

    if (isPrivateFeedback) {
      if (!features.privateFeedback) {
        recordPrivateFeedbackDenied({
          reason: "feature_disabled",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          {
            error: "Private feedback is not currently available",
            code: PRIVATE_FEEDBACK_DISABLED_CODE,
          },
          { status: 403 }
        );
      }

      const suspension = await checkSuspension();
      if (suspension.suspended) {
        recordPrivateFeedbackDenied({
          reason: "suspended",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          { error: suspension.error || "Account suspended" },
          { status: 403 }
        );
      }

      if (!session.user.emailVerified) {
        recordPrivateFeedbackDenied({
          reason: "unverified_email",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          { error: "Email verification required" },
          { status: 403 }
        );
      }

      if (targetUserId === session.user.id) {
        recordPrivateFeedbackDenied({
          reason: "self_target",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          { error: "You cannot submit feedback about yourself" },
          { status: 403 }
        );
      }

      if (targetUserId !== listing.ownerId) {
        recordPrivateFeedbackDenied({
          reason: "invalid_target",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          { error: "Private feedback can only target the listing owner" },
          { status: 400 }
        );
      }

      const conversationExists = await prisma.conversation.findFirst({
        where: {
          listingId,
          AND: [
            { participants: { some: { id: session.user.id } } },
            { participants: { some: { id: listing.ownerId } } },
          ],
        },
        select: { id: true },
      });

      if (!conversationExists) {
        recordPrivateFeedbackDenied({
          reason: "no_prior_conversation",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
        return NextResponse.json(
          {
            error:
              "You can only submit private feedback after contacting this host",
          },
          { status: 403 }
        );
      }
    }

    // Check for existing active report (duplicate prevention)
    // Allow re-report only if previous report was DISMISSED
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: session.user.id,
        listingId,
        kind,
        status: { in: [...ACTIVE_REPORT_STATUSES] }, // Allow re-report if DISMISSED
      },
    });

    if (existingReport) {
      if (isPrivateFeedback) {
        recordPrivateFeedbackDenied({
          reason: "duplicate",
          listingId,
          reporterId: session.user.id,
          targetUserId,
        });
      }
      return NextResponse.json(
        {
          error:
            "You have already reported this listing. Your report is being reviewed.",
        },
        { status: 409 }
      );
    }

    const report = await prisma.report.create({
      data: {
        listingId,
        reporterId: session.user.id,
        reason,
        details: details?.trim() || undefined,
        kind,
        ...(isPrivateFeedback ? { targetUserId } : {}),
      },
    });

    if (isPrivateFeedback && isPrivateFeedbackCategory(reason)) {
      recordPrivateFeedbackSubmission({
        category: reason,
        listingId,
        reporterId: session.user.id,
        targetUserId,
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    return captureApiError(error, { route: "/api/reports", method: "POST" });
  }
}
