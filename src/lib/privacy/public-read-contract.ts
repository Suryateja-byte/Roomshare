export const PUBLIC_PAYLOAD_FORBIDDEN_KEYS = [
  "exact_point",
  "exactPoint",
  "coords",
  "address",
  "address_line_1",
  "addressLine1",
  "normalizedAddress",
  "unit_number",
  "unitNumber",
  "phone",
  "phoneNumber",
  "phone_e164",
  "phoneE164",
] as const;

const FORBIDDEN_PUBLIC_KEY_SET = new Set<string>(
  PUBLIC_PAYLOAD_FORBIDDEN_KEYS
);

export function findForbiddenPublicPayloadKeys(value: unknown): string[] {
  const found = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_PUBLIC_KEY_SET.has(key)) {
        found.add(key);
      }
      visit(child);
    }
  };

  visit(value);
  return Array.from(found).sort();
}
