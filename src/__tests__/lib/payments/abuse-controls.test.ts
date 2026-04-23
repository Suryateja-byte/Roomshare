import {
  evaluateCheckoutAbuse,
  isDisposableEmail,
  normalizeEmailForAbuse,
} from "@/lib/payments/abuse-controls";

function buildClient(counts: number[] = []) {
  const count = jest.fn();
  for (const value of counts) {
    count.mockResolvedValueOnce(value);
  }
  count.mockResolvedValue(0);

  return {
    paymentAbuseSignal: {
      count,
      create: jest.fn().mockResolvedValue({ id: "signal-1" }),
    },
  } as any;
}

function request() {
  return new Request("http://localhost/api/payments/checkout", {
    headers: {
      "x-real-ip": "203.0.113.10",
      "user-agent": "jest-agent",
      "accept-language": "en-US",
    },
  });
}

describe("payment abuse controls", () => {
  it("normalizes Gmail dots and plus tags without changing login normalization", () => {
    expect(normalizeEmailForAbuse("User.Name+move@GoogleMail.com")).toBe(
      "username@gmail.com"
    );
    expect(normalizeEmailForAbuse("renter+tag@example.com")).toBe(
      "renter@example.com"
    );
  });

  it("detects disposable email domains", () => {
    expect(isDisposableEmail("buyer@mailinator.com")).toBe(true);
    expect(isDisposableEmail("buyer@example.com")).toBe(false);
  });

  it("records checkout attempt signals when allowed", async () => {
    const client = buildClient([0, 0]);

    const result = await evaluateCheckoutAbuse(client, {
      userId: "user-123",
      email: "user@example.com",
      request: request(),
    });

    expect(result).toEqual({ allowed: true });
    expect(client.paymentAbuseSignal.create).toHaveBeenCalledTimes(3);
  });

  it("blocks disposable email checkouts with a non-enumerating message", async () => {
    const client = buildClient();

    const result = await evaluateCheckoutAbuse(client, {
      userId: "user-123",
      email: "user@mailinator.com",
      request: request(),
    });

    expect(result).toMatchObject({
      allowed: false,
      status: 403,
      code: "DISPOSABLE_EMAIL",
    });
    expect(client.paymentAbuseSignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        signalKind: "disposable_email",
        reason: "checkout_blocked",
      }),
    });
  });

  it("throttles repeated checkout attempts by IP or fingerprint window", async () => {
    const client = buildClient([10, 0]);

    const result = await evaluateCheckoutAbuse(client, {
      userId: "user-123",
      email: "user@example.com",
      request: request(),
    });

    expect(result).toMatchObject({
      allowed: false,
      status: 429,
      code: "PAYMENT_ABUSE_THROTTLED",
    });
  });
});
