import { features } from "@/lib/env";

export function isPhase01CanonicalWritesEnabled(): boolean {
  return features.phase01CanonicalWrites;
}

export const PHASE01_KILL_SWITCHES = {
  disable_new_publication: false,
  pause_identity_reconcile: false,
} as const;

export type Phase01KillSwitch = keyof typeof PHASE01_KILL_SWITCHES;

/** Phase 01 stub: all kill switches remain disabled. */
export function isKillSwitchActive(name: Phase01KillSwitch): boolean {
  return PHASE01_KILL_SWITCHES[name];
}
