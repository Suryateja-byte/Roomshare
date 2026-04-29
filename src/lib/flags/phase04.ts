import { features } from "@/lib/env";

export function isPhase04ProjectionReadsEnabled(): boolean {
  return features.phase04ProjectionReads;
}

export const PHASE04_KILL_SWITCHES = {
  force_list_only: false,
  force_clusters_only: false,
} as const;

export type Phase04KillSwitch = keyof typeof PHASE04_KILL_SWITCHES;

export function isPhase04KillSwitchActive(name: Phase04KillSwitch): boolean {
  switch (name) {
    case "force_list_only":
      return features.forceListOnly;
    case "force_clusters_only":
      return features.forceClustersOnly;
    default: /* istanbul ignore next */ {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export function isPhase04ForceListOnlyActive(): boolean {
  return isPhase04KillSwitchActive("force_list_only");
}

export function isPhase04ForceClustersOnlyActive(): boolean {
  return isPhase04KillSwitchActive("force_clusters_only");
}
