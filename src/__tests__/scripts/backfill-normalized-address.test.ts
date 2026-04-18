import { normalizeAddress } from "@/lib/search/normalize-address";
import { computeNormalizedAddressForRow } from "../../../scripts/cfm/normalized-address-computer";

describe("scripts/cfm/normalized-address-computer", () => {
  it("matches normalizeAddress for populated rows", () => {
    const row = {
      address: "900 Example Lane Apt 2B",
      city: "Testville",
      state: "TS",
      zip: "70001",
    };

    expect(computeNormalizedAddressForRow(row)).toBe(normalizeAddress(row));
  });

  it("returns an empty string for all-null input", () => {
    expect(
      computeNormalizedAddressForRow({
        address: null,
        city: null,
        state: null,
        zip: null,
      })
    ).toBe("");
  });

  it("handles mixed null fields", () => {
    const row = {
      address: "901 Example Lane",
      city: null,
      state: "TS",
      zip: undefined,
    };

    expect(computeNormalizedAddressForRow(row)).toBe(normalizeAddress(row));
    expect(computeNormalizedAddressForRow(row)).toBe("901 example lane ts");
  });
});
