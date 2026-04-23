jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map<string, string>();
      if (init?.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          headers.set(key, value);
        }
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      };
    },
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
    contactPaywall: true,
    searchAlertPaywall: false,
  },
}));

jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, any> = {
    stripeEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  return { prisma };
});

const mockConstructEvent = jest.fn();
jest.mock("@/lib/payments/stripe", () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  }),
}));

const mockRecordStripeEventReplayIgnored = jest.fn();
jest.mock("@/lib/payments/telemetry", () => ({
  recordStripeEventReplayIgnored: (...args: unknown[]) =>
    mockRecordStripeEventReplayIgnored(...args),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { prisma } from "@/lib/prisma";

describe("POST /api/stripe/webhook", () => {
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    (prisma.stripeEvent.create as jest.Mock).mockResolvedValue({
      id: "stripe-row-1",
    });
    (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({
      id: "outbox-1",
    });
  });

  afterAll(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it("captures a verified Stripe event and enqueues async payment webhook work", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "payment_intent.succeeded",
      created: 1776900000,
      livemode: true,
      data: {
        object: {
          id: "pi_123",
        },
      },
    });
    (prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: JSON.stringify({ id: "evt_1" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripeEventId: "evt_1",
        eventType: "payment_intent.succeeded",
        stripeObjectId: "pi_123",
        livemode: true,
        signatureVerified: true,
        processingStatus: "PENDING",
      }),
      select: { id: true },
    });
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateType: "PAYMENT",
        aggregateId: "stripe-row-1",
        kind: "PAYMENT_WEBHOOK",
        priority: 20,
      }),
      select: { id: true },
    });
  });

  it("acknowledges already processed replayed events without enqueueing duplicate work", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_replayed",
      type: "payment_intent.succeeded",
      created: 1776900000,
      livemode: true,
      data: { object: { id: "pi_123" } },
    });
    (prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue({
      id: "stripe-row-1",
      processedAt: new Date("2026-04-23T00:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: JSON.stringify({ id: "evt_replayed" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(mockRecordStripeEventReplayIgnored).toHaveBeenCalledWith({
      stripeEventId: "evt_replayed",
      eventType: "payment_intent.succeeded",
    });
  });

  it("acknowledges already captured pending events without replay telemetry", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_pending",
      type: "payment_intent.succeeded",
      created: 1776900000,
      livemode: true,
      data: { object: { id: "pi_123" } },
    });
    (prisma.stripeEvent.findUnique as jest.Mock).mockResolvedValue({
      id: "stripe-row-1",
      processedAt: null,
    });

    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: JSON.stringify({ id: "evt_pending" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(mockRecordStripeEventReplayIgnored).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid signatures before capture", async () => {
    const missing = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      })
    );
    expect(missing.status).toBe(400);

    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const invalid = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
        },
        body: "{}",
      })
    );
    expect(invalid.status).toBe(400);
    expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
  });
});
