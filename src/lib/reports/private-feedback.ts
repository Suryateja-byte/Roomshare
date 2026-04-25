export const REPORT_KINDS = [
  "ABUSE_REPORT",
  "PRIVATE_FEEDBACK",
] as const;

export type ReportKindValue = (typeof REPORT_KINDS)[number];

export const ABUSE_REPORT_REASONS = [
  "fraud",
  "inappropriate",
  "spam",
  "misleading",
  "other",
] as const;

export type AbuseReportReason = (typeof ABUSE_REPORT_REASONS)[number];

export const PRIVATE_FEEDBACK_CATEGORIES = [
  "unresponsive_host",
  "misleading_listing_details",
  "pressure_tactics",
  "general_concern",
] as const;

export type PrivateFeedbackCategory =
  (typeof PRIVATE_FEEDBACK_CATEGORIES)[number];

export const PRIVATE_FEEDBACK_DISABLED_CODE = "PRIVATE_FEEDBACK_DISABLED";
export const PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH = 2000;
export const REPORT_REASON_MAX_LENGTH = 100;
export const REPORT_TARGET_USER_MAX_LENGTH = 100;
export const ACTIVE_REPORT_STATUSES = ["OPEN", "RESOLVED"] as const;

export const PRIVATE_FEEDBACK_DENIAL_REASONS = [
  "duplicate",
  "feature_disabled",
  "has_accepted_booking",
  "invalid_target",
  "no_prior_conversation",
  "rate_limit",
  "self_target",
  "suspended",
  "unverified_email",
] as const;

export type PrivateFeedbackDeniedReason =
  (typeof PRIVATE_FEEDBACK_DENIAL_REASONS)[number];

export function isPrivateFeedbackCategory(
  value: string
): value is PrivateFeedbackCategory {
  return PRIVATE_FEEDBACK_CATEGORIES.includes(
    value as PrivateFeedbackCategory
  );
}

export function isAbuseReportReason(value: string): value is AbuseReportReason {
  return ABUSE_REPORT_REASONS.includes(value as AbuseReportReason);
}

export function isPrivateFeedbackKind(
  value: ReportKindValue
): value is "PRIVATE_FEEDBACK" {
  return value === "PRIVATE_FEEDBACK";
}

export function canLeavePrivateFeedback(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  hasPriorConversation: boolean;
  hasAcceptedBooking: boolean;
  hasExistingPrivateFeedback: boolean;
}): boolean {
  return (
    options.isLoggedIn &&
    !options.isOwner &&
    options.isEmailVerified &&
    options.hasPriorConversation &&
    !options.hasAcceptedBooking &&
    !options.hasExistingPrivateFeedback
  );
}
