/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));
jest.mock("@/lib/env", () => ({
  features: {
    get disablePhoneReveal() {
      return process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL === "true";
    },
    get contactPaywall() {
      return process.env.ENABLE_CONTACT_PAYWALL === "true";
    },
    get contactPaywallEnforcement() {
      return process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT === "true";
    },
    get entitlementState() {
      return false;
    },
    get emergencyOpenPaywall() {
      return false;
    },
  },
}));

import {
  encryptPhoneForReveal,
  revealHostPhoneForListing,
} from "@/lib/contact/phone-reveal";

function buildClient() {
  return {
    listing: {
      findUnique: jest.fn(),
    },
    physicalUnit: {
      findUnique: jest.fn(),
    },
    blockedUser: {
      findFirst: jest.fn(),
    },
    contactConsumption: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "reveal-consumption-1" }),
    },
    entitlementGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    entitlementState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

const activeListing = {
  ownerId: "host-1",
  physicalUnitId: "unit-1",
  status: "ACTIVE",
  statusReason: null,
  needsMigrationReview: false,
  availabilitySource: "HOST_MANAGED",
  availableSlots: 1,
  totalSlots: 1,
  openSlots: 1,
  moveInDate: new Date("2026-05-01T00:00:00.000Z"),
  availableUntil: null,
  minStayMonths: 1,
  lastConfirmedAt: new Date("2026-04-20T12:00:00.000Z"),
  owner: {
    isSuspended: false,
  },
};

describe("revealHostPhoneForListing", () => {
  const originalDisable = process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL;
  const originalPaywall = process.env.ENABLE_CONTACT_PAYWALL;
  const originalEnforcement = process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT;
  const originalKey = process.env.PHONE_REVEAL_ENCRYPTION_KEY;
  const key = "phase05-phone-reveal-test-key";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL = "false";
    process.env.ENABLE_CONTACT_PAYWALL = "false";
    process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = "false";
    process.env.PHONE_REVEAL_ENCRYPTION_KEY = key;
  });

  afterAll(() => {
    if (originalDisable === undefined) {
      delete process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL;
    } else {
      process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL = originalDisable;
    }
    if (originalKey === undefined) {
      delete process.env.PHONE_REVEAL_ENCRYPTION_KEY;
    } else {
      process.env.PHONE_REVEAL_ENCRYPTION_KEY = originalKey;
    }
    if (originalPaywall === undefined) {
      delete process.env.ENABLE_CONTACT_PAYWALL;
    } else {
      process.env.ENABLE_CONTACT_PAYWALL = originalPaywall;
    }
    if (originalEnforcement === undefined) {
      delete process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT;
    } else {
      process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = originalEnforcement;
    }
  });

  it("reveals a verified host phone and writes an audit row", async () => {
    const client = buildClient();
    client.listing.findUnique.mockResolvedValue(activeListing);
    client.blockedUser.findFirst.mockResolvedValue(null);
    client.$queryRaw.mockResolvedValue([
      {
        phoneE164Ciphertext: encryptPhoneForReveal("+15551234567", key),
        phoneE164Last4: "4567",
      },
    ]);

    const result = await revealHostPhoneForListing(
      {
        viewerUserId: "renter-1",
        listingId: "listing-1",
        clientIdempotencyKey: "reveal-idem-1",
      },
      client as never
    );

    expect(result).toEqual({
      ok: true,
      phoneNumber: "+15551234567",
      phoneLast4: "4567",
    });
    expect(
      client.$executeRaw.mock.calls.some((call) =>
        String(call[0]).includes("phone_reveal_audits")
      )
    ).toBe(true);
  });

  it("fails closed before database work when the kill switch is active", async () => {
    process.env.KILL_SWITCH_DISABLE_PHONE_REVEAL = "true";
    const client = buildClient();

    const result = await revealHostPhoneForListing(
      {
        viewerUserId: "renter-1",
        listingId: "listing-1",
      },
      client as never
    );

    expect(result).toEqual({
      ok: false,
      status: 503,
      code: "PHONE_REVEAL_DISABLED",
      error: "Phone reveal is unavailable right now.",
    });
    expect(client.listing.findUnique).not.toHaveBeenCalled();
  });

  it("returns a neutral response and skips phone lookup when the host blocks the viewer", async () => {
    const client = buildClient();
    client.listing.findUnique.mockResolvedValue(activeListing);
    client.blockedUser.findFirst.mockResolvedValue({ id: "block-1" });

    const result = await revealHostPhoneForListing(
      {
        viewerUserId: "renter-1",
        listingId: "listing-1",
        clientIdempotencyKey: "blocked-idem",
      },
      client as never
    );

    expect(result).toEqual({
      ok: false,
      status: 423,
      code: "HOST_NOT_ACCEPTING_CONTACT",
      error: "This host is not accepting contact right now.",
    });
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.$executeRaw).toHaveBeenCalled();
  });

  it("fails closed and audits when the decrypt key is unavailable", async () => {
    const ciphertext = encryptPhoneForReveal("+15551234567", key);
    delete process.env.PHONE_REVEAL_ENCRYPTION_KEY;
    const client = buildClient();
    client.listing.findUnique.mockResolvedValue(activeListing);
    client.blockedUser.findFirst.mockResolvedValue(null);
    client.$queryRaw.mockResolvedValue([
      {
        phoneE164Ciphertext: ciphertext,
        phoneE164Last4: "4567",
      },
    ]);

    const result = await revealHostPhoneForListing(
      {
        viewerUserId: "renter-1",
        listingId: "listing-1",
      },
      client as never
    );

    expect(result).toEqual({
      ok: false,
      status: 503,
      code: "PHONE_REVEAL_DEPENDENCY_UNAVAILABLE",
      error: "Phone reveal is unavailable right now.",
    });
    expect(client.$executeRaw).toHaveBeenCalled();
  });

  it("returns a paywall response before phone lookup when reveal credits are exhausted", async () => {
    process.env.ENABLE_CONTACT_PAYWALL = "true";
    process.env.ENABLE_CONTACT_PAYWALL_ENFORCEMENT = "true";
    const client = buildClient();
    client.listing.findUnique.mockResolvedValue(activeListing);
    client.physicalUnit.findUnique.mockResolvedValue({
      id: "unit-1",
      unitIdentityEpoch: 1,
    });
    client.blockedUser.findFirst.mockResolvedValue(null);
    client.contactConsumption.count.mockResolvedValue(2);

    const result = await revealHostPhoneForListing(
      {
        viewerUserId: "renter-1",
        listingId: "listing-1",
        clientIdempotencyKey: "reveal-paywall-idem",
      },
      client as never
    );

    expect(result).toEqual({
      ok: false,
      status: 402,
      code: "PAYWALL_REQUIRED",
      error: "Unlock contact to message this host.",
    });
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.$executeRaw).toHaveBeenCalled();
  });
});
