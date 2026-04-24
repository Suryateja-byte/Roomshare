import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { auth } from "@/auth";
import { checkEmailVerified, checkSuspension } from "@/app/actions/suspension";
import { captureApiError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/csrf";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { evaluateListingContactable } from "@/lib/messaging/listing-contactable";
import {
  evaluateContactPaywall,
  evaluateMessageStartPaywall,
} from "@/lib/payments/contact-paywall";
import { centsToDecimal } from "@/lib/payments/checkout-session-status";
import {
  getProductCatalogEntry,
  isProductCode,
} from "@/lib/payments/catalog";
import { evaluateSavedSearchAlertPaywall } from "@/lib/payments/search-alert-paywall";
import { getStripeClient, getStripePriceId } from "@/lib/payments/stripe";
import {
  recordCheckoutSessionCreated,
  recordPaywallBypassMissingUnitId,
} from "@/lib/payments/telemetry";
import { evaluateCheckoutAbuse } from "@/lib/payments/abuse-controls";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  purchaseContext: z
    .enum(["CONTACT_HOST", "PHONE_REVEAL", "SEARCH_ALERTS"])
    .optional(),
  listingId: z.string().trim().min(1).max(100).optional(),
  clientIdempotencyKey: z.string().trim().min(1).max(200).optional(),
  productCode: z
    .string()
    .trim()
    .refine(isProductCode, "Invalid product code"),
}).superRefine((data, ctx) => {
  const purchaseContext = data.purchaseContext ?? "CONTACT_HOST";

  if (
    (purchaseContext === "CONTACT_HOST" || purchaseContext === "PHONE_REVEAL") &&
    !data.listingId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "listingId is required for contact checkout",
      path: ["listingId"],
    });
  }

  if (
    purchaseContext === "SEARCH_ALERTS" &&
    data.productCode !== "MOVERS_PASS_30D"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Saved-search alerts require MOVERS_PASS_30D",
      path: ["productCode"],
    });
  }
});

export async function POST(request: Request) {
  if (!features.contactPaywall && !features.searchAlertPaywall) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (features.disablePayments) {
    const response = NextResponse.json(
      {
        error: "Payments are temporarily unavailable. Please try again shortly.",
        code: "PAYMENTS_DISABLED",
      },
      { status: 503 }
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const csrfResponse = validateCsrf(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, {
    type: "paymentsCheckout",
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const suspension = await checkSuspension();
    if (suspension.suspended) {
      return NextResponse.json(
        { error: suspension.error || "Account suspended" },
        { status: 403 }
      );
    }

    const emailCheck = await checkEmailVerified();
    if (!emailCheck.verified) {
      return NextResponse.json(
        {
          error:
            emailCheck.error || "Please verify your email before purchasing",
        },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const purchaseContext = parsed.data.purchaseContext ?? "CONTACT_HOST";
    const listingId = parsed.data.listingId ?? null;
    const clientIdempotencyKey = parsed.data.clientIdempotencyKey ?? null;
    const productCode = parsed.data.productCode as
      | "CONTACT_PACK_3"
      | "MOVERS_PASS_30D";
    const product = getProductCatalogEntry(productCode);
    const origin = new URL(request.url).origin;

    const abuse = await evaluateCheckoutAbuse(prisma, {
      userId: session.user.id,
      email: session.user.email,
      request,
    });
    if (!abuse.allowed) {
      return NextResponse.json(
        { error: abuse.message, code: abuse.code },
        { status: abuse.status }
      );
    }

    let successUrl: string;
    let cancelUrl: string;
    let clientReferenceId: string | undefined;
    let metadata:
      | {
          purchaseContext: "CONTACT_HOST";
          userId: string;
          listingId: string;
          unitId: string;
          unitIdentityEpoch: string;
          productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
          contactKind: "MESSAGE_START";
        }
      | {
          purchaseContext: "PHONE_REVEAL";
          userId: string;
          listingId: string;
          unitId: string;
          unitIdentityEpoch: string;
          productCode: "CONTACT_PACK_3" | "MOVERS_PASS_30D";
          contactKind: "REVEAL_PHONE";
        }
      | {
          purchaseContext: "SEARCH_ALERTS";
          userId: string;
          productCode: "MOVERS_PASS_30D";
          contactKind: "MESSAGE_START";
        };

    if (purchaseContext === "SEARCH_ALERTS") {
      if (!features.searchAlertPaywall) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const alertPaywall = await evaluateSavedSearchAlertPaywall({
        userId: session.user.id,
      });
      if (!alertPaywall.requiresPurchase) {
        return NextResponse.json(
          { error: "Alerts are already available on your account." },
          { status: 409 }
        );
      }

      successUrl = `${origin}/saved-searches?alertsCheckout=success&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = new URL(
        "/saved-searches?alertsCheckout=cancelled",
        origin
      ).toString();
      clientReferenceId = "saved-searches";
      metadata = {
        purchaseContext: "SEARCH_ALERTS",
        userId: session.user.id,
        productCode: "MOVERS_PASS_30D",
        contactKind: "MESSAGE_START",
      };
    } else {
      if (!features.contactPaywall) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const listing = await prisma.listing.findUnique({
        where: { id: listingId! },
        select: {
          id: true,
          ownerId: true,
          physicalUnitId: true,
          title: true,
          status: true,
          statusReason: true,
          availableSlots: true,
          totalSlots: true,
          openSlots: true,
          moveInDate: true,
          availableUntil: true,
          minStayMonths: true,
          lastConfirmedAt: true,
        },
      });

      const contactable = evaluateListingContactable(listing);
      if (!contactable.ok) {
        return NextResponse.json(
          { error: contactable.message, code: contactable.code },
          { status: contactable.code === "LISTING_NOT_FOUND" ? 404 : 403 }
        );
      }

      if (contactable.listing.ownerId === session.user.id) {
        return NextResponse.json(
          { error: "You cannot purchase contact access for your own listing" },
          { status: 400 }
        );
      }

      const paywall =
        purchaseContext === "PHONE_REVEAL"
          ? await evaluateContactPaywall({
              userId: session.user.id,
              physicalUnitId: contactable.listing.physicalUnitId,
              contactKind: "REVEAL_PHONE",
            })
          : await evaluateMessageStartPaywall({
              userId: session.user.id,
              physicalUnitId: contactable.listing.physicalUnitId,
            });

      if (paywall.unavailable) {
        return NextResponse.json(
          { error: "Contact is temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }

      if (!paywall.unitId || paywall.unitIdentityEpoch === null) {
        recordPaywallBypassMissingUnitId({
          userId: session.user.id,
          listingId: listingId!,
          reason: contactable.listing.physicalUnitId
            ? "missing_physical_unit_row"
            : "missing_physical_unit_id",
        });

        return NextResponse.json(
          { error: "This listing does not require purchase right now." },
          { status: 409 }
        );
      }

      if (!paywall.summary.requiresPurchase) {
        return NextResponse.json(
          { error: "Contact is already available for this listing." },
          { status: 409 }
        );
      }

      const checkoutParam =
        purchaseContext === "PHONE_REVEAL"
          ? "phoneRevealCheckout"
          : "contactCheckout";
      successUrl = `${origin}/listings/${listingId}?${checkoutParam}=success&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl = new URL(
        `/listings/${listingId}?${checkoutParam}=cancelled`,
        origin
      ).toString();
      clientReferenceId = listingId!;
      metadata =
        purchaseContext === "PHONE_REVEAL"
          ? {
              purchaseContext: "PHONE_REVEAL",
              userId: session.user.id,
              listingId: listingId!,
              unitId: paywall.unitId,
              unitIdentityEpoch: String(paywall.unitIdentityEpoch),
              productCode,
              contactKind: "REVEAL_PHONE",
            }
          : {
              purchaseContext: "CONTACT_HOST",
              userId: session.user.id,
              listingId: listingId!,
              unitId: paywall.unitId,
              unitIdentityEpoch: String(paywall.unitIdentityEpoch),
              productCode,
              contactKind: "MESSAGE_START",
            };
    }

    const stripe = getStripeClient();
    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment" as const,
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clientReferenceId,
      customer_email: session.user.email ?? undefined,
      line_items: [
        {
          price: getStripePriceId(productCode),
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
        description: product.checkoutName,
      },
    };
    const checkoutSession = clientIdempotencyKey
      ? await stripe.checkout.sessions.create(checkoutParams, {
          idempotencyKey: [
            "checkout",
            session.user.id,
            purchaseContext,
            listingId ?? "none",
            productCode,
            clientIdempotencyKey,
          ].join(":"),
        })
      : await stripe.checkout.sessions.create(checkoutParams);

    if (!checkoutSession.url) {
      throw new Error("Stripe checkout session did not return a URL");
    }

    await prisma.payment.create({
      data: {
        userId: session.user.id,
        productCode,
        status: "CHECKOUT_CREATED",
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : null,
        livemode: checkoutSession.livemode === true,
        stripeCustomerId:
          typeof checkoutSession.customer === "string"
            ? checkoutSession.customer
            : null,
        amount: centsToDecimal(product.amountCents),
        currency: "usd",
        metadata,
      },
    });

    recordCheckoutSessionCreated({
      userId: session.user.id,
      purchaseContext,
      listingId,
      productCode,
    });

    const response = NextResponse.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return captureApiError(error, {
      route: "/api/payments/checkout",
      method: "POST",
    });
  }
}
