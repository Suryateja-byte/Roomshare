import { NextResponse } from "next/server";

jest.mock("@/lib/env", () => ({
  features: {
    publicCacheCoherence: true,
    disablePublicCachePush: false,
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/public-cache/push", () => ({
  deactivatePublicCachePushSubscription: jest.fn(),
  upsertPublicCachePushSubscription: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn(),
}));

import {
  DELETE,
  POST,
} from "@/app/api/public-cache/push-subscription/route";
import { auth } from "@/auth";
import { features } from "@/lib/env";
import {
  deactivatePublicCachePushSubscription,
  upsertPublicCachePushSubscription,
} from "@/lib/public-cache/push";
import { withRateLimit } from "@/lib/with-rate-limit";

const authMock = auth as jest.Mock;
const upsertMock = upsertPublicCachePushSubscription as jest.Mock;
const deactivateMock = deactivatePublicCachePushSubscription as jest.Mock;
const withRateLimitMock = withRateLimit as jest.Mock;
const mockFeatures = features as {
  publicCacheCoherence: boolean;
  disablePublicCachePush: boolean;
};

const subscription = {
  endpoint: "https://push.example/subscription-1",
  keys: {
    p256dh: "p256dh-key",
    auth: "auth-key",
  },
};

describe("/api/public-cache/push-subscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.publicCacheCoherence = true;
    mockFeatures.disablePublicCachePush = false;
    withRateLimitMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    upsertMock.mockResolvedValue({ ok: true });
    deactivateMock.mockResolvedValue({ ok: true });
  });

  it("stores push subscriptions through the encrypted server helper", async () => {
    const response = await POST(
      new Request("https://roomshare.app/api/public-cache/push-subscription", {
        method: "POST",
        body: JSON.stringify({ subscription }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(upsertMock).toHaveBeenCalledWith({
      subscription,
      userId: "user-1",
    });
  });

  it("pauses registration when the push kill switch is enabled", async () => {
    mockFeatures.disablePublicCachePush = true;

    const response = await POST(
      new Request("https://roomshare.app/api/public-cache/push-subscription", {
        method: "POST",
        body: JSON.stringify({ subscription }),
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: "push_disabled",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns validation errors without logging or echoing raw endpoints", async () => {
    upsertMock.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_subscription",
    });

    const response = await POST(
      new Request("https://roomshare.app/api/public-cache/push-subscription", {
        method: "POST",
        body: JSON.stringify({ subscription }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: "invalid_subscription",
    });
  });

  it("deactivates subscriptions by endpoint through the hashed helper", async () => {
    const response = await DELETE(
      new Request("https://roomshare.app/api/public-cache/push-subscription", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
    );

    expect(response.status).toBe(200);
    expect(deactivateMock).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
    });
  });

  it("preserves no-store on rate-limited responses", async () => {
    withRateLimitMock.mockResolvedValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const response = await POST(
      new Request("https://roomshare.app/api/public-cache/push-subscription", {
        method: "POST",
        body: JSON.stringify({ subscription }),
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
