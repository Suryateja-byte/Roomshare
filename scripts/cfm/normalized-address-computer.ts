import { normalizeAddress } from "../../src/lib/search/normalize-address";

export interface NormalizedAddressSourceRow {
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  zip: string | null | undefined;
}

export function computeNormalizedAddressForRow(
  row: NormalizedAddressSourceRow
): string {
  return normalizeAddress({
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
  });
}
