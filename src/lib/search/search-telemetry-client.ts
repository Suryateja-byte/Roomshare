"use client";

type SearchClientMetric =
  | {
      metric: "search_client_abort_total";
      route: "search-results-client" | "persistent-map-wrapper";
      queryHash?: string;
      reason: string;
    }
  | {
      metric: "search_map_list_mismatch_total";
      route: "search-results-client" | "persistent-map-wrapper";
      queryHash?: string;
      responseQueryHash?: string;
      reason: string;
    };

export function emitSearchClientMetric(metric: SearchClientMetric): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test") {
    return;
  }

  const body = JSON.stringify(metric);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/metrics/search", blob);
    return;
  }

  fetch("/api/metrics/search", {
    method: "POST",
    body,
    keepalive: true,
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    // Telemetry must never affect UX.
  });
}
