import { canonicalizeAddress } from "@/lib/identity/canonical-address";
import { CANONICALIZER_VERSION } from "@/lib/identity/canonicalizer-version";

describe("canonicalizeAddress", () => {
  const base = {
    city: "San Francisco",
    state: "ca",
    zip: "94107-1234",
  };

  it("collapses whitespace, punctuation, and common street suffix variants", () => {
    const variants = [
      "123 Main St Apt 4B",
      "  123  main  st  apt 4B ",
      "123 MAIN ST APT 4B",
      "123 Main St. Apt 4B",
      "123 Main Street Apt 4B",
    ].map((address) => canonicalizeAddress({ ...base, address }));

    expect(new Set(variants.map((variant) => variant.canonicalAddressHash)).size).toBe(1);
    expect(new Set(variants.map((variant) => variant.canonicalUnit)).size).toBe(1);
  });

  it("collapses nullish unit variants to _none_", () => {
    const outputs = [undefined, null, "", "   ", "null"].map((unit) =>
      canonicalizeAddress({
        ...base,
        address: "55 Oak Avenue",
        unit,
      })
    );

    expect(new Set(outputs.map((output) => output.canonicalAddressHash)).size).toBe(1);
    expect(outputs.every((output) => output.canonicalUnit === "_none_")).toBe(true);
  });

  it("defaults country to US and normalizes diacritics", () => {
    const first = canonicalizeAddress({
      address: "9 Rue de l'Été",
      city: "Montréal",
      state: "qc",
      zip: "H2Y 1C6",
    });
    const second = canonicalizeAddress({
      address: "9 Rue de l'Ete",
      city: "Montreal",
      state: "QC",
      zip: "H2Y1C6",
      country: "US",
    });

    expect(first.canonicalAddressHash).toBe(second.canonicalAddressHash);
  });

  it("returns a 32-character base64url hash and the current version", () => {
    const output = canonicalizeAddress({
      address: "123 Main St",
      city: "Austin",
      state: "tx",
      zip: "73301",
      unit: "Unit 12",
    });

    expect(output.canonicalAddressHash).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(output.canonicalizerVersion).toBe(CANONICALIZER_VERSION);
    expect(output.canonicalUnit).toBe("12");
  });
});
