/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

import { recordContactAttempt } from "@/lib/contact/contact-attempts";

describe("recordContactAttempt", () => {
  it("writes an idempotent contact attempt row", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    await recordContactAttempt(tx as never, {
      userId: "renter-1",
      listingId: "listing-1",
      unitId: "unit-1",
      unitIdentityEpochObserved: 1,
      unitIdentityEpochResolved: 1,
      outcome: "SUCCEEDED",
      clientIdempotencyKey: "idem-1",
      conversationId: "conv-1",
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$executeRaw.mock.calls[0][0])).toContain(
      "contact_attempts"
    );
  });

  it("rejects PII-like metadata keys before writing", async () => {
    const tx = {
      $executeRaw: jest.fn(),
    };

    await expect(
      recordContactAttempt(tx as never, {
        userId: "renter-1",
        listingId: "listing-1",
        outcome: "SUCCEEDED",
        metadata: {
          phone: "+15551234567",
        },
      })
    ).rejects.toThrow(/PII-like contact attempt metadata key/);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
