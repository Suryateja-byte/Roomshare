const UNIT_KEYWORD_PATTERN = /\b(apartment|apt|suite|ste|unit)\b/g;
const HASH_UNIT_PATTERN = /#\s*([a-z0-9]+)/g;
const UNIT_TOKEN_PATTERN = /\bunit\s*([a-z0-9]+)\b/g;
const TRAILING_UNIT_NOISE_PATTERN = /\s(?:unit|#)\s*$/;

function normalizeSegment(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddress(input: {
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  zip: string | null | undefined;
}): string {
  let address = normalizeSegment(input.address)
    .replace(UNIT_KEYWORD_PATTERN, "unit")
    .replace(/\s+/g, " ")
    .trim();

  if (/#\s*[a-z0-9]+/.test(address)) {
    address = address
      .replace(HASH_UNIT_PATTERN, (_, token: string) => `#${token}`)
      .replace(TRAILING_UNIT_NOISE_PATTERN, "")
      .replace(/\s+/g, " ")
      .trim();
  } else if (/\bunit\s*[a-z0-9]+\b/.test(address)) {
    address = address
      .replace(UNIT_TOKEN_PATTERN, (_, token: string) => `unit ${token}`)
      .replace(TRAILING_UNIT_NOISE_PATTERN, "")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    address = address
      .replace(TRAILING_UNIT_NOISE_PATTERN, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return [
    address,
    normalizeSegment(input.city),
    normalizeSegment(input.state),
    normalizeSegment(input.zip),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
