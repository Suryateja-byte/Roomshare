import { features } from "@/lib/env";

export function isPhase02ProjectionWritesEnabled(): boolean {
  return features.phase02ProjectionWrites;
}

/**
 * Phase 02 kill switches.
 *
 * These are live env-backed values (unlike the Phase 01 stubs).
 * `disable_new_publication` is the Phase 02 adoption of the stub declared in phase01.ts.
 */
export const PHASE02_KILL_SWITCHES = {
  disable_new_publication: false,
  pause_geocode_publish: false,
  pause_backfills_and_repairs: false,
} as const;

export type Phase02KillSwitch = keyof typeof PHASE02_KILL_SWITCHES;

export function isKillSwitchActive(name: Phase02KillSwitch): boolean {
  switch (name) {
    case "disable_new_publication":
      return features.disableNewPublication;
    case "pause_geocode_publish":
      return features.pauseGeocodePublish;
    case "pause_backfills_and_repairs":
      return features.pauseBackfillsAndRepairs;
    default: /* istanbul ignore next */ {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
