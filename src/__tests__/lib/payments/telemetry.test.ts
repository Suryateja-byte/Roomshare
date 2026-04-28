/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

const mockInfo = jest.fn();
const mockWarn = jest.fn();

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: (...args: unknown[]) => mockInfo(...args),
      warn: (...args: unknown[]) => mockWarn(...args),
    },
  },
}));

import {
  recordContactConsumptionCreated,
  recordContactRestorationApplied,
  recordStartConversationBlockedPaywall,
  recordStartConversationPaywallUnavailable,
} from "@/lib/payments/telemetry";

function expectNoRawIds(payload: Record<string, unknown>, rawIds: string[]) {
  expect(payload).not.toHaveProperty("userId");
  expect(payload).not.toHaveProperty("listingId");
  expect(payload).not.toHaveProperty("unitId");
  expect(payload).not.toHaveProperty("contactConsumptionId");

  for (const rawId of rawIds) {
    expect(Object.values(payload)).not.toContain(rawId);
  }
}

describe("paywall telemetry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hashes start-conversation paywall identifiers", () => {
    recordStartConversationBlockedPaywall({
      userId: "user-raw",
      listingId: "listing-raw",
      unitId: "unit-raw",
    });

    const payload = mockInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        metric: "start_conversation_blocked_paywall",
        userIdHash: expect.any(String),
        listingIdHash: expect.any(String),
        unitIdHash: expect.any(String),
      })
    );
    expectNoRawIds(payload, ["user-raw", "listing-raw", "unit-raw"]);
  });

  it("hashes contact consumption identifiers", () => {
    recordContactConsumptionCreated({
      userId: "user-raw",
      unitId: "unit-raw",
      unitIdentityEpoch: 7,
      source: "FREE",
    });

    const payload = mockInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        metric: "contact_consumption_created",
        userIdHash: expect.any(String),
        unitIdHash: expect.any(String),
        unitIdentityEpoch: 7,
        source: "FREE",
      })
    );
    expectNoRawIds(payload, ["user-raw", "unit-raw"]);
  });

  it("hashes restoration contact-consumption identifiers", () => {
    recordContactRestorationApplied({
      userId: "user-raw",
      contactConsumptionId: "consumption-raw",
      reason: "HOST_BAN",
    });

    const payload = mockInfo.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        metric: "contact_restoration_applied",
        userIdHash: expect.any(String),
        contactConsumptionIdHash: expect.any(String),
        reason: "HOST_BAN",
      })
    );
    expectNoRawIds(payload, ["user-raw", "consumption-raw"]);
  });

  it("hashes paywall-unavailable identifiers on warning telemetry", () => {
    recordStartConversationPaywallUnavailable({
      userId: "user-raw",
      listingId: "listing-raw",
    });

    const payload = mockWarn.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        metric: "start_conversation_paywall_unavailable",
        userIdHash: expect.any(String),
        listingIdHash: expect.any(String),
      })
    );
    expectNoRawIds(payload, ["user-raw", "listing-raw"]);
  });
});
