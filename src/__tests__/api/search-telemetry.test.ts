jest.mock("@/lib/rate-limit-redis", () => ({
  checkMetricsRateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: jest.fn(() => "127.0.0.1"),
}));

const mockIsOriginAllowed = jest.fn().mockReturnValue(true);
const mockIsHostAllowed = jest.fn().mockReturnValue(true);

jest.mock("@/lib/origin-guard", () => ({
  isOriginAllowed: (...args: unknown[]) => mockIsOriginAllowed(...args),
  isHostAllowed: (...args: unknown[]) => mockIsHostAllowed(...args),
  // Use the real same-origin logic so production-path tests are meaningful.
  isSameOrigin: (origin: string | null, host: string | null) => {
    if (!origin || !host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((value: unknown) => String(value)),
}));

import { POST } from "@/app/api/metrics/search/route";
import {
  getSearchTelemetrySnapshot,
  resetSearchTelemetryForTests,
} from "@/lib/search/search-telemetry";

describe("POST /api/metrics/search", () => {
  beforeEach(() => {
    resetSearchTelemetryForTests();
    jest.clearAllMocks();
    // clearAllMocks() resets call history but leaks mockReturnValue overrides,
    // so re-assert the allow-by-default origin/host guard each test.
    mockIsOriginAllowed.mockReturnValue(true);
    mockIsHostAllowed.mockReturnValue(true);
  });

  it("records a client abort metric", async () => {
    const req = new Request("http://localhost/api/metrics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "search_client_abort_total",
        route: "search-results-client",
        queryHash: "hash-1",
        reason: "superseded",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(getSearchTelemetrySnapshot().clientAbortTotal).toBe(1);
  });

  it("rejects invalid payloads", async () => {
    const req = new Request("http://localhost/api/metrics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "search_client_abort_total",
        route: "search-results-client",
        reason: "not-allowed",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(getSearchTelemetrySnapshot().clientAbortTotal).toBe(0);
  });

  it("records a snapshot-expired client metric", async () => {
    const req = new Request("http://localhost/api/metrics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "search_snapshot_expired_total",
        route: "search-results-client",
        queryHash: "hash-1",
        reason: "snapshot_expired",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(getSearchTelemetrySnapshot().snapshotExpiredTotal).toBe(1);
  });

  it("accepts grouped-card panel open metrics", async () => {
    const req = new Request("http://localhost/api/metrics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "search_dedup_open_panel_click",
        groupSize: 4,
        queryHashPrefix8: "deadbeef",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it("accepts collision action metrics", async () => {
    const req = new Request("http://localhost/api/metrics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: "listing_create_collision_action_selected",
        action: "add_date",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  describe("production origin enforcement", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, NODE_ENV: "production" };
      // Empty allowlist: this is exactly the local-prod-build / unconfigured case.
      mockIsOriginAllowed.mockReturnValue(false);
      mockIsHostAllowed.mockReturnValue(false);
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    const ABORT_PAYLOAD = {
      metric: "search_client_abort_total",
      route: "search-results-client",
      queryHash: "hash-1",
      reason: "superseded",
    };

    it("accepts a same-origin beacon even when the allowlist is empty", async () => {
      const req = new Request("http://localhost:3000/api/metrics/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify(ABORT_PAYLOAD),
      });

      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(getSearchTelemetrySnapshot().clientAbortTotal).toBe(1);
    });

    it("rejects a cross-origin beacon (returns 403)", async () => {
      const req = new Request("http://localhost:3000/api/metrics/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://evil.com",
          host: "localhost:3000",
        },
        body: JSON.stringify(ABORT_PAYLOAD),
      });

      const res = await POST(req);

      expect(res.status).toBe(403);
      expect(getSearchTelemetrySnapshot().clientAbortTotal).toBe(0);
    });
  });
});
