import { features } from "@/lib/env";
import {
  isKillSwitchActive as phase02KillSwitch,
} from "@/lib/flags/phase02";

export function isPhase01CanonicalWritesEnabled(): boolean {
  return features.phase01CanonicalWrites;
}

export const PHASE01_KILL_SWITCHES = {
  disable_new_publication: false,
  pause_identity_reconcile: false,
} as const;

export type Phase01KillSwitch = keyof typeof PHASE01_KILL_SWITCHES;

/**
 * Kill switch resolver for Phase 01 callers.
 *
 * `disable_new_publication` is now live-backed via Phase 02's flag module.
 * `pause_identity_reconcile` remains a stub until the identity reconciler lands (Phase 04+).
 */
export function isKillSwitchActive(name: Phase01KillSwitch): boolean {
  switch (name) {
    case "disable_new_publication":
      // Phase 02 un-stubs this — delegate to the live env-backed value.
      return phase02KillSwitch("disable_new_publication");
    case "pause_identity_reconcile":
      // Still stub in Phase 02; identity reconciler deferred to Phase 04+.
      return false;
    default: /* istanbul ignore next */ {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
