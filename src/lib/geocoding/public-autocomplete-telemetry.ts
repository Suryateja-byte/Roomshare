import { logger } from "@/lib/logger";

export function recordPublicAutocompleteRequest(source: "legacy" | "public_contract") {
  logger.sync.info("cfm.public_autocomplete.requests_total", {
    source,
  });
}

export function recordPublicAutocompletePrivacyViolation(details: {
  label: string;
  query: string;
}) {
  logger.sync.warn("cfm.public_autocomplete.privacy_violation", details);
}

export function recordPublicAutocompleteFallbackUsed(reason: string) {
  logger.sync.info("cfm.public_autocomplete.fallback_used", {
    reason,
  });
}

export function recordPublicAutocompleteVisibilityMismatch(details: {
  listingId: string;
  status: string | null;
  statusReason: string | null;
}) {
  logger.sync.warn("cfm.public_autocomplete.visibility_mismatch", details);
}
