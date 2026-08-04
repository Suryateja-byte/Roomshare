import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import Stripe from "stripe";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { drainOutboxOnce } from "@/lib/outbox/drain";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { getStripeClient } from "@/lib/payments/stripe";
import { recordStripeEventReplayIgnored } from "@/lib/payments/telemetry";

export const runtime = "nodejs";
// The post-response drain tick needs headroom beyond the request itself.
export const maxDuration = 60;

function getStripeObjectId(event: Stripe.Event): string | null {
  return event.data.object &&
    typeof event.data.object === "object" &&
    "id" in event.data.object &&
    typeof event.data.object.id === "string"
    ? event.data.object.id
    : null;
}

async function captureStripeEvent(event: Stripe.Event): Promise<{
  id: string;
  alreadyCaptured: boolean;
  alreadyProcessed: boolean;
}> {
  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true, processedAt: true },
  });

  if (existing) {
    return {
      id: existing.id,
      alreadyCaptured: true,
      alreadyProcessed: existing.processedAt !== null,
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          stripeObjectId: getStripeObjectId(event),
          payload: event as unknown as Prisma.InputJsonValue,
          livemode: event.livemode === true,
          signatureVerified: true,
          processingStatus: "PENDING",
        },
        select: { id: true },
      });

      await appendOutboxEvent(tx, {
        aggregateType: "PAYMENT",
        aggregateId: created.id,
        kind: "PAYMENT_WEBHOOK",
        payload: {
          stripeEventId: event.id,
          eventType: event.type,
        },
        sourceVersion: BigInt(event.created ?? Math.floor(Date.now() / 1000)),
        unitIdentityEpoch: 1,
        priority: 20,
      });

      return {
        id: created.id,
        alreadyCaptured: false,
        alreadyProcessed: false,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.stripeEvent.findUnique({
        where: { stripeEventId: event.id },
        select: { id: true, processedAt: true },
      });

      if (concurrent) {
        return {
          id: concurrent.id,
          alreadyCaptured: true,
          alreadyProcessed: concurrent.processedAt !== null,
        };
      }
    }

    throw error;
  }
}

export async function POST(request: Request) {
  if (!features.contactPaywall && !features.searchAlertPaywall) {
    return NextResponse.json({ received: true });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Missing Stripe signature or webhook secret" },
      { status: 400 }
    );
  }

  let payload: string;
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook signature verification failed",
      },
      { status: 400 }
    );
  }

  try {
    const stripeEvent = await captureStripeEvent(event);
    if (stripeEvent.alreadyProcessed) {
      recordStripeEventReplayIgnored({
        stripeEventId: event.id,
        eventType: event.type,
      });
    } else {
      // Fulfil now instead of waiting for the daily cron. Without this the grant is only
      // created when daily-maintenance drains the outbox, so a paying customer waits up
      // to ~24h for credits they already bought (vercel.json registers one daily cron).
      //
      // Gated on alreadyProcessed, NOT alreadyCaptured: a Stripe retry after a failed
      // attempt is captured-but-unprocessed, which is exactly when the kick matters.
      //
      // Deliberately NOT phase02-gated — fulfilment must not depend on a projection flag.
      // Scoped to PAYMENT_WEBHOOK so this can never perform projection writes that the
      // flag has switched off. The outbox row remains the durable retry net: after() is
      // best-effort, and drainOutboxOnce leases rows with FOR UPDATE SKIP LOCKED plus a
      // stale-IN_FLIGHT reaper, so a crash mid-tick is recovered by the cron.
      after(async () => {
        try {
          await drainOutboxOnce({
            kinds: ["PAYMENT_WEBHOOK"],
            maxBatch: 5,
            maxTickMs: 5000,
          });
        } catch (error) {
          logger.sync.error("stripe.inline_fulfilment_failed", {
            stripeEventId: event.id,
            eventType: event.type,
            error: sanitizeErrorMessage(error),
          });
        }
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to capture webhook",
      },
      { status: 500 }
    );
  }
}
