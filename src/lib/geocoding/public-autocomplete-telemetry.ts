import { logger } from "@/lib/logger";
import { createHash } from "node:crypto";

export function recordPublicAutocompleteRequest(
  source: "legacy" | "public_contract"
) {
  logger.sync.info("cfm.public_autocomplete.requests_total", {
    source,
  });
}

export function recordPublicAutocompletePrivacyViolation(details: {
  label: string;
  query: string;
}) {
  logger.sync.warn("cfm.public_autocomplete.privacy_violation", {
    labelHash: hashValue(details.label),
    labelLength: details.label.length,
    queryHash: hashValue(details.query),
    queryLength: details.query.length,
    queryHasDigit: /\d/.test(details.query),
  });
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

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
