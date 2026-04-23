import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { features } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { getStripeClient } from "@/lib/payments/stripe";
import { recordStripeEventReplayIgnored } from "@/lib/payments/telemetry";

export const runtime = "nodejs";

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
