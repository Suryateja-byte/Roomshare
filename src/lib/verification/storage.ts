import "server-only";

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const VERIFICATION_DOCUMENTS_BUCKET = "verification-documents";
export const VERIFICATION_SIGNED_URL_TTL_SECONDS = 60;
export const VERIFICATION_UPLOAD_TTL_MS = 60 * 60 * 1000;
export const VERIFICATION_DOCUMENT_RETENTION_DAYS = 30;
export const VERIFICATION_DOCUMENT_RETENTION_MS =
  VERIFICATION_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const VERIFICATION_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type VerificationUploadKind = "document" | "selfie";
export type VerificationMimeType =
  (typeof VERIFICATION_ALLOWED_MIME_TYPES)[number];

const MIME_TO_EXTENSION: Record<VerificationMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAGIC_BYTES: Record<
  VerificationMimeType,
  { offset: number; bytes: number[] }[]
> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
};

export function isVerificationMimeType(
  mimeType: string
): mimeType is VerificationMimeType {
  return VERIFICATION_ALLOWED_MIME_TYPES.includes(
    mimeType as VerificationMimeType
  );
}

export function validateVerificationMagicBytes(
  buffer: Buffer,
  mimeType: VerificationMimeType
): boolean {
  const signatures = MAGIC_BYTES[mimeType];

  return signatures.every((signature) => {
    if (buffer.length < signature.offset + signature.bytes.length) {
      return false;
    }

    return signature.bytes.every(
      (byte, index) => buffer[signature.offset + index] === byte
    );
  });
}

export function buildVerificationStoragePath(
  userId: string,
  kind: VerificationUploadKind,
  mimeType: VerificationMimeType
): string {
  const extension = MIME_TO_EXTENSION[mimeType];
  return `${userId}/${kind}/${crypto.randomUUID()}.${extension}`;
}

export function getVerificationStorageClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("VERIFICATION_STORAGE_NOT_CONFIGURED");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createVerificationSignedUrl(
  storagePath: string
): Promise<string> {
  const supabase = getVerificationStorageClient();
  const { data, error } = await supabase.storage
    .from(VERIFICATION_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, VERIFICATION_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw error || new Error("SIGNED_URL_NOT_RETURNED");
  }

  return data.signedUrl;
}

export async function deleteVerificationObjects(
  storagePaths: Array<string | null | undefined>
): Promise<number> {
  const paths = Array.from(new Set(storagePaths.filter(Boolean))) as string[];
  if (paths.length === 0) {
    return 0;
  }

  const supabase = getVerificationStorageClient();
  const { error } = await supabase.storage
    .from(VERIFICATION_DOCUMENTS_BUCKET)
    .remove(paths);

  if (error) {
    throw error;
  }

  return paths.length;
}
