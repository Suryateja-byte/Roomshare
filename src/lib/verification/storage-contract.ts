export const VERIFICATION_DOCUMENTS_BUCKET = "verification-documents";

export const VERIFICATION_NEW_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const VERIFICATION_LEGACY_BACKFILL_MAX_BYTES = 20 * 1024 * 1024;
export const VERIFICATION_BUCKET_MAX_BYTES =
  VERIFICATION_LEGACY_BACKFILL_MAX_BYTES;

export const VERIFICATION_NEW_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const VERIFICATION_LEGACY_BACKFILL_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const VERIFICATION_BUCKET_ALLOWED_MIME_TYPES =
  VERIFICATION_LEGACY_BACKFILL_MIME_TYPES;

export type VerificationNewUploadMimeType =
  (typeof VERIFICATION_NEW_UPLOAD_MIME_TYPES)[number];

export type VerificationLegacyBackfillMimeType =
  (typeof VERIFICATION_LEGACY_BACKFILL_MIME_TYPES)[number];
