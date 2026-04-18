jest.mock("@/lib/rate-limit-redis", () => ({
  checkMetricsRateLimit: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: jest.fn(() => "127.0.0.1"),
}));

jest.mock("@/lib/origin-guard", () => ({
  isOriginAllowed: jest.fn(() => true),
  isHostAllowed: jest.fn(() => true),
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
});
