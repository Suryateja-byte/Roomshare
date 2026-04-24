export interface DegradedSafeModeEnv {
  KILL_SWITCH_FORCE_LIST_ONLY?: string;
  KILL_SWITCH_DISABLE_SEMANTIC_SEARCH?: string;
  KILL_SWITCH_DISABLE_PHONE_REVEAL?: string;
  KILL_SWITCH_DISABLE_NEW_PUBLICATION?: string;
}

export interface DegradedSafeModeReport {
  enabled: boolean;
  missingEnvVars: string[];
  activeBehaviors: string[];
}

const REQUIRED_ENV_VARS = [
  "KILL_SWITCH_FORCE_LIST_ONLY",
  "KILL_SWITCH_DISABLE_SEMANTIC_SEARCH",
  "KILL_SWITCH_DISABLE_PHONE_REVEAL",
  "KILL_SWITCH_DISABLE_NEW_PUBLICATION",
] as const;

const ACTIVE_BEHAVIORS = [
  "list-only search",
  "semantic search disabled",
  "phone reveal disabled",
  "new publication disabled",
] as const;

export function evaluateDegradedSafeMode(
  env: DegradedSafeModeEnv
): DegradedSafeModeReport {
  const missingEnvVars = REQUIRED_ENV_VARS.filter(
    (key) => env[key] !== "true"
  );

  return {
    enabled: missingEnvVars.length === 0,
    missingEnvVars,
    activeBehaviors:
      missingEnvVars.length === 0 ? [...ACTIVE_BEHAVIORS] : [],
  };
}
