export interface EmergencyOpenDrillInput {
  contactAttempts: number;
  flagDisabledAfterExercise: boolean;
}

export interface EmergencyOpenDrillReport {
  emergencyGrantAuditCount: number;
  fraudAuditJobsScheduled: number;
  normalPaywallRestored: boolean;
}

export function simulateEmergencyOpenPaywallDrill(
  input: EmergencyOpenDrillInput
): EmergencyOpenDrillReport {
  return {
    emergencyGrantAuditCount: input.contactAttempts,
    fraudAuditJobsScheduled: input.contactAttempts,
    normalPaywallRestored: input.flagDisabledAfterExercise,
  };
}
