import crypto from "crypto";
import { CANONICALIZER_VERSION } from "@/lib/identity/canonicalizer-version";

export interface RawAddressInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  unit?: string | null;
  country?: string;
}

export interface CanonicalAddressOutput {
  canonicalAddressHash: string;
  canonicalUnit: string;
  canonicalizerVersion: string;
}

const TOKEN_NORMALIZATIONS: Record<string, string> = {
  apartment: "apt",
  avenue: "ave",
  boulevard: "blvd",
  circle: "cir",
  court: "ct",
  drive: "dr",
  east: "e",
  floor: "fl",
  highway: "hwy",
  lane: "ln",
  north: "n",
  parkway: "pkwy",
  place: "pl",
  road: "rd",
  room: "rm",
  south: "s",
  street: "st",
  suite: "ste",
  terrace: "ter",
  trail: "trl",
  unit: "unit",
  west: "w",
};

const UNIT_PREFIXES = new Set(["apt", "apartment", "room", "rm", "ste", "suite", "unit"]);

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ");
}

function normalizeText(value: string): string {
  const withoutDiacritics = stripControlChars(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");

  const collapsed = withoutDiacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (!collapsed) {
    return "";
  }

  return collapsed
    .split(" ")
    .map((token) => TOKEN_NORMALIZATIONS[token] ?? token)
    .join(" ");
}

function normalizeZip(zip: string): string {
  const digits = zip.replace(/\D/g, "");
  return digits.slice(0, 5);
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = normalizeText(unit ?? "");

  if (!normalized || normalized === "null") {
    return "_none_";
  }

  const tokens = normalized.split(" ");
  const strippedTokens =
    tokens.length > 1 && UNIT_PREFIXES.has(tokens[0]) ? tokens.slice(1) : tokens;
  const collapsed = strippedTokens.join(" ").trim();

  return collapsed || "_none_";
}

function buildTuple(input: RawAddressInput): { tuple: string; canonicalUnit: string } {
  const canonicalUnit = normalizeUnit(input.unit);
  const country = normalizeText(input.country ?? "US") || "us";

  return {
    canonicalUnit,
    tuple: [
      normalizeText(input.address),
      normalizeText(input.city),
      normalizeText(input.state),
      normalizeZip(input.zip),
      canonicalUnit,
      country,
    ].join("|"),
  };
}

/**
 * Normalize raw address fields into a stable canonical identity.
 */
export function canonicalizeAddress(
  input: RawAddressInput
): CanonicalAddressOutput {
  const { tuple, canonicalUnit } = buildTuple(input);
  const canonicalAddressHash = crypto
    .createHash("sha256")
    .update(tuple)
    .digest("base64url")
    .slice(0, 32);

  return {
    canonicalAddressHash,
    canonicalUnit,
    canonicalizerVersion: CANONICALIZER_VERSION,
  };
}
