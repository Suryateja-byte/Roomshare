"use client";

import type { LegacyUrlAlias } from "@/lib/search-params";

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
    }
  | {
      metric: "search_snapshot_expired_total";
      route: "search-results-client";
      queryHash?: string;
      reason: "search_contract_changed" | "snapshot_missing" | "snapshot_expired";
    }
  | {
      metric: "cfm.search.legacy_url_count";
      alias: LegacyUrlAlias;
      surface: "spa";
    }
  | {
      metric: "search_dedup_open_panel_click";
      groupSize: number;
      queryHashPrefix8: string;
    }
  | {
      metric: "search_dedup_member_click";
      groupSize: number;
      memberIndex: number;
    }
  | {
      metric: "listing_create_collision_action_selected";
      action: "update" | "add_date" | "create_separate" | "cancel";
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

export function emitSearchDedupOpenPanelClick({
  groupSize,
  queryHashPrefix8,
}: {
  groupSize: number;
  queryHashPrefix8: string;
}): void {
  emitSearchClientMetric({
    metric: "search_dedup_open_panel_click",
    groupSize,
    queryHashPrefix8,
  });
}

export function emitSearchDedupMemberClick({
  groupSize,
  memberIndex,
}: {
  groupSize: number;
  memberIndex: number;
}): void {
  emitSearchClientMetric({
    metric: "search_dedup_member_click",
    groupSize,
    memberIndex,
  });
}

export function emitListingCreateCollisionActionSelected({
  action,
}: {
  action: "update" | "add_date" | "create_separate" | "cancel";
}): void {
  emitSearchClientMetric({
    metric: "listing_create_collision_action_selected",
    action,
  });
}
