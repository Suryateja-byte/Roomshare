import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { auth } from "@/auth";
import { captureApiError } from "@/lib/api-error-handler";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  classifyCheckoutSessionSnapshot,
  isMatchingCheckoutRequest,
  parsePaywallMetadata,
  type PurchaseContext,
} from "@/lib/payments/checkout-session-status";
import { getStripeClient } from "@/lib/payments/stripe";
import { recordCheckoutStatusForeignSession } from "@/lib/payments/telemetry";
import { withRateLimit } from "@/lib/with-rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  session_id: z.string().trim().min(1).max(255),
  listing_id: z.string().trim().min(1).max(100).optional(),
  context: z.enum(["CONTACT_HOST", "PHONE_REVEAL", "SEARCH_ALERTS"]).optional(),
}).superRefine((data, ctx) => {
  const purchaseContext = data.context ?? "CONTACT_HOST";
  if (
    (purchaseContext === "CONTACT_HOST" || purchaseContext === "PHONE_REVEAL") &&
    !data.listing_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "listing_id is required for contact checkout status",
      path: ["listing_id"],
    });
  }
});

function jsonNoStore(data: unknown, init?: { status?: number }) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function notFoundResponse() {
  return jsonNoStore({ error: "Not found" }, { status: 404 });
}

export async function GET(request: Request) {
  if (!features.contactPaywall && !features.searchAlertPaywall) {
    return jsonNoStore({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResponse = await withRateLimit(request, {
    type: "paymentsCheckoutStatus",
    getIdentifier: async () => session.user.id,
    endpoint: "/api/payments/checkout-session",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "private, no-store");
    return rateLimitResponse;
  }

  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      session_id: url.searchParams.get("session_id") ?? undefined,
      listing_id: url.searchParams.get("listing_id") ?? undefined,
      context: url.searchParams.get("context") ?? undefined,
    });

    if (!parsed.success) {
      return jsonNoStore(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { session_id: sessionId } = parsed.data;
    const listingId = parsed.data.listing_id ?? null;
    const purchaseContext = (parsed.data.context ?? "CONTACT_HOST") as PurchaseContext;
    const payment = await prisma.payment.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
      select: {
        id: true,
        userId: true,
        productCode: true,
        status: true,
        metadata: true,
      },
    });

    if (!payment) {
      return notFoundResponse();
    }

    const metadata = parsePaywallMetadata(payment.metadata);
    if (
      !metadata ||
      payment.userId !== session.user.id ||
      metadata.userId !== session.user.id ||
      !isMatchingCheckoutRequest({
        metadata,
        purchaseContext,
        listingId,
      })
    ) {
      recordCheckoutStatusForeignSession({
        userId: session.user.id,
        purchaseContext,
        listingId,
        sessionId,
      });
      return notFoundResponse();
    }

    const grant = await prisma.entitlementGrant.findUnique({
      where: { paymentId: payment.id },
      select: { id: true, status: true },
    });
    const hasGrant = !!grant && grant.status === "ACTIVE";

    let stripeSession: Stripe.Checkout.Session | null = null;
    if (
      !hasGrant &&
      payment.status !== "SUCCEEDED" &&
      payment.status !== "FAILED" &&
      payment.status !== "CANCELED"
    ) {
      stripeSession = await getStripeClient().checkout.sessions.retrieve(sessionId);
      const stripeMetadata = parsePaywallMetadata(stripeSession.metadata);
      if (
        !stripeMetadata ||
        stripeMetadata.userId !== session.user.id ||
        !isMatchingCheckoutRequest({
          metadata: stripeMetadata,
          purchaseContext,
          listingId,
        })
      ) {
        recordCheckoutStatusForeignSession({
          userId: session.user.id,
          purchaseContext,
          listingId,
          sessionId,
        });
        return notFoundResponse();
      }
    }

    const snapshot = classifyCheckoutSessionSnapshot({
      localPaymentStatus: payment.status,
      hasGrant,
      stripeCheckoutStatus: stripeSession?.status,
      stripePaymentStatus: stripeSession?.payment_status,
    });

    return jsonNoStore({
      sessionId,
      purchaseContext,
      listingId:
        metadata.purchaseContext === "CONTACT_HOST" ||
        metadata.purchaseContext === "PHONE_REVEAL"
          ? metadata.listingId
          : null,
      productCode: payment.productCode,
      ...snapshot,
      requiresViewerStateRefresh:
        purchaseContext === "CONTACT_HOST"
          ? snapshot.requiresViewerStateRefresh
          : false,
    });
  } catch (error) {
    return captureApiError(error, {
      route: "/api/payments/checkout-session",
      method: "GET",
      userId: session.user.id,
    });
  }
}
