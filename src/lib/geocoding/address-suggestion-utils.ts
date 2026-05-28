export interface AddressSuggestionIdentityInput {
  id?: string;
  label?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

export interface AddressUnitSuffixParts {
  baseAddress: string;
  unitSuffix: string | null;
}

export interface AddressSearchContext {
  city?: string;
  state?: string;
  zip?: string;
}

export interface ParsedAddressInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  unitSuffix: string | null;
}

const TRAILING_UNIT_PATTERN =
  /(?:^|[\s,])((?:apt|apartment|unit|suite|ste)\.?\s*#?\s*[A-Za-z0-9][A-Za-z0-9-]*|#\s*[A-Za-z0-9][A-Za-z0-9-]*)\s*$/i;

const STATE_ALIASES: Record<string, string> = {
  al: "AL",
  alabama: "AL",
  ak: "AK",
  alaska: "AK",
  az: "AZ",
  arizona: "AZ",
  ar: "AR",
  arkansas: "AR",
  ca: "CA",
  california: "CA",
  co: "CO",
  colorado: "CO",
  ct: "CT",
  connecticut: "CT",
  de: "DE",
  delaware: "DE",
  dc: "DC",
  "district of columbia": "DC",
  fl: "FL",
  florida: "FL",
  ga: "GA",
  georgia: "GA",
  hi: "HI",
  hawaii: "HI",
  id: "ID",
  idaho: "ID",
  il: "IL",
  illinois: "IL",
  in: "IN",
  indiana: "IN",
  ia: "IA",
  iowa: "IA",
  ks: "KS",
  kansas: "KS",
  ky: "KY",
  kentucky: "KY",
  la: "LA",
  louisiana: "LA",
  me: "ME",
  maine: "ME",
  md: "MD",
  maryland: "MD",
  ma: "MA",
  massachusetts: "MA",
  mi: "MI",
  michigan: "MI",
  mn: "MN",
  minnesota: "MN",
  ms: "MS",
  mississippi: "MS",
  mo: "MO",
  missouri: "MO",
  mt: "MT",
  montana: "MT",
  ne: "NE",
  nebraska: "NE",
  nv: "NV",
  nevada: "NV",
  nh: "NH",
  "new hampshire": "NH",
  nj: "NJ",
  "new jersey": "NJ",
  nm: "NM",
  "new mexico": "NM",
  ny: "NY",
  "new york": "NY",
  nc: "NC",
  "north carolina": "NC",
  nd: "ND",
  "north dakota": "ND",
  oh: "OH",
  ohio: "OH",
  ok: "OK",
  oklahoma: "OK",
  or: "OR",
  oregon: "OR",
  pa: "PA",
  pennsylvania: "PA",
  ri: "RI",
  "rhode island": "RI",
  sc: "SC",
  "south carolina": "SC",
  sd: "SD",
  "south dakota": "SD",
  tn: "TN",
  tennessee: "TN",
  tx: "TX",
  texas: "TX",
  ut: "UT",
  utah: "UT",
  vt: "VT",
  vermont: "VT",
  va: "VA",
  virginia: "VA",
  wa: "WA",
  washington: "WA",
  wv: "WV",
  "west virginia": "WV",
  wi: "WI",
  wisconsin: "WI",
  wy: "WY",
  wyoming: "WY",
};

function normalizeIdentityPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCoordinate(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(6)
    : "";
}

function cleanAddressPart(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function joinAddressParts(parts: string[], separator = ", "): string {
  return parts.filter((part) => part.trim().length > 0).join(separator);
}

export function normalizeUsState(value: string | undefined): string {
  const normalized = normalizeIdentityPart(value).replace(/\./g, "");
  return STATE_ALIASES[normalized] ?? "";
}

function parseStateZip(value: string): { state: string; zip: string } | null {
  const normalized = cleanAddressPart(value);
  const match = normalized.match(
    /^([A-Za-z][A-Za-z .]*?)(?:\s+(\d{5}(?:-\d{4})?))?$/
  );
  if (!match) {
    return null;
  }

  const state = normalizeUsState(match[1]);
  if (!state) {
    return null;
  }

  return { state, zip: match[2] ?? "" };
}

function parseCityStateZip(
  value: string
): { city: string; state: string; zip: string } | null {
  const normalized = cleanAddressPart(value);
  const match = normalized.match(
    /^(.+?)\s+([A-Za-z]{2}|[A-Za-z][A-Za-z .]*?)(?:\s+(\d{5}(?:-\d{4})?))?$/
  );
  if (!match) {
    return null;
  }

  const state = normalizeUsState(match[2]);
  if (!state) {
    return null;
  }

  return {
    city: cleanAddressPart(match[1]),
    state,
    zip: match[3] ?? "",
  };
}

export function splitTrailingAddressUnit(
  value: string
): AddressUnitSuffixParts {
  const trimmed = value.trim();
  const match = trimmed.match(TRAILING_UNIT_PATTERN);
  if (!match || match.index === undefined) {
    return { baseAddress: trimmed, unitSuffix: null };
  }

  const baseAddress = trimmed
    .slice(0, match.index)
    .trim()
    .replace(/[,\s]+$/, "");
  if (!baseAddress) {
    return { baseAddress: trimmed, unitSuffix: null };
  }

  return {
    baseAddress,
    unitSuffix: match[1].trim().replace(/\s+/g, " "),
  };
}

export function stripTrailingAddressUnit(value: string): string {
  return splitTrailingAddressUnit(value).baseAddress;
}

export function parseAddressInput(value: string): ParsedAddressInput {
  const { baseAddress, unitSuffix } = splitTrailingAddressUnit(value);
  const parts = baseAddress
    .split(",")
    .map((part) => cleanAddressPart(part))
    .filter(Boolean);

  if (parts.length >= 3) {
    const stateZip = parseStateZip(parts[parts.length - 1]);
    if (stateZip) {
      return {
        address: parts.slice(0, -2).join(", "),
        city: parts[parts.length - 2],
        state: stateZip.state,
        zip: stateZip.zip,
        unitSuffix,
      };
    }
  }

  if (parts.length === 2) {
    const cityStateZip = parseCityStateZip(parts[1]);
    if (cityStateZip) {
      return {
        address: parts[0],
        city: cityStateZip.city,
        state: cityStateZip.state,
        zip: cityStateZip.zip,
        unitSuffix,
      };
    }

    const stateZip = parseStateZip(parts[1]);
    if (stateZip) {
      return {
        address: parts[0],
        city: "",
        state: stateZip.state,
        zip: stateZip.zip,
        unitSuffix,
      };
    }

    return {
      address: parts[0],
      city: parts[1],
      state: "",
      zip: "",
      unitSuffix,
    };
  }

  return {
    address: cleanAddressPart(baseAddress),
    city: "",
    state: "",
    zip: "",
    unitSuffix,
  };
}

export function buildAddressAutocompleteProviderQuery(
  input: string,
  context: AddressSearchContext = {}
): string {
  const parsed = parseAddressInput(input);
  const state = normalizeUsState(parsed.state || context.state);
  const zip = cleanAddressPart(parsed.zip || context.zip || "");
  const city = cleanAddressPart(parsed.city || context.city || "");
  const stateZip = joinAddressParts([state, zip], " ");

  return joinAddressParts([parsed.address, city, stateZip]);
}

export function appendTypedAddressUnit(
  baseAddress: string,
  typedAddress: string
): string {
  const { unitSuffix } = splitTrailingAddressUnit(typedAddress);
  const trimmedBase = baseAddress.trim();
  return unitSuffix ? `${trimmedBase}, ${unitSuffix}` : trimmedBase;
}

export function formatParsedAddressForSelection(
  parsed: ParsedAddressInput,
  context: AddressSearchContext = {}
): Omit<ParsedAddressInput, "unitSuffix"> {
  return {
    address: parsed.unitSuffix
      ? `${parsed.address}, ${parsed.unitSuffix}`
      : parsed.address,
    city: parsed.city || cleanAddressPart(context.city || ""),
    state: normalizeUsState(parsed.state || context.state) || parsed.state,
    zip: parsed.zip || cleanAddressPart(context.zip || ""),
  };
}

export function getAddressSuggestionIdentityKey(
  suggestion: AddressSuggestionIdentityInput
): string {
  const providerId = normalizeIdentityPart(suggestion.id);
  const label = normalizeIdentityPart(suggestion.label);
  if (providerId && !providerId.endsWith(":0") && label) {
    return `provider:${providerId}|${label}`;
  }

  return [
    "address",
    normalizeIdentityPart(suggestion.address),
    normalizeIdentityPart(suggestion.city),
    normalizeIdentityPart(suggestion.state),
    normalizeIdentityPart(suggestion.zip),
    normalizeCoordinate(suggestion.lat),
    normalizeCoordinate(suggestion.lng),
  ].join("|");
}

export function getAddressSuggestionRenderKey(
  suggestion: AddressSuggestionIdentityInput,
  index: number
): string {
  return `${getAddressSuggestionIdentityKey(suggestion)}|${index}`;
}

export function dedupeAddressSuggestions<
  T extends AddressSuggestionIdentityInput,
>(suggestions: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const suggestion of suggestions) {
    const key = getAddressSuggestionIdentityKey(suggestion);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(suggestion);
  }

  return unique;
}
