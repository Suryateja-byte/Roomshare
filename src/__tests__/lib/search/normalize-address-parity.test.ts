import { normalizeAddress } from "@/lib/search/normalize-address";

interface NormalizeAddressFixture {
  semanticGroup: string;
  label: string;
  input: {
    address: string | null | undefined;
    city: string | null | undefined;
    state: string | null | undefined;
    zip: string | null | undefined;
  };
}

interface BaseAddressRecord {
  city: string;
  number: number;
  state: string;
  street: string;
  token: string;
  zip: string;
}

const STATES = ["TS", "QA", "NV", "OR", "IL", "ME"];
const STREET_NAMES = [
  "Alpha Way",
  "Beta Road",
  "Gamma Court",
  "Delta Place",
  "Epsilon Trail",
  "Zeta Lane",
];
const CITY_NAMES = [
  "Testville",
  "Fixture Bay",
  "Sample Point",
  "Demo Ridge",
  "Parity Falls",
  "Spec Harbor",
];

function toFullwidth(value: string): string {
  return Array.from(value)
    .map((char) => {
      if (char === " ") {
        return "\u3000";
      }

      const code = char.charCodeAt(0);
      if (code >= 33 && code <= 126) {
        return String.fromCharCode(code + 0xfee0);
      }

      return char;
    })
    .join("");
}

function buildBaseRecord(index: number): BaseAddressRecord {
  return {
    number: 1000 + index,
    street: `${STREET_NAMES[index % STREET_NAMES.length]} ${index + 1}`,
    city: `${CITY_NAMES[index % CITY_NAMES.length]} ${index + 1}`,
    state: STATES[index % STATES.length],
    zip: String(73000 + index).padStart(5, "0"),
    token: `${index + 1}b`,
  };
}

function buildPlainFixtures(
  base: BaseAddressRecord,
  index: number
): NormalizeAddressFixture[] {
  return [
    {
      semanticGroup: `plain-${index}`,
      label: "canonical",
      input: {
        address: `${base.number} ${base.street}.`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `plain-${index}`,
      label: "mixed-case-whitespace",
      input: {
        address: `  ${base.number}   ${base.street.toUpperCase()}   `,
        city: ` ${base.city.toLowerCase()} `,
        state: ` ${base.state} `,
        zip: ` ${base.zip} `,
      },
    },
    {
      semanticGroup: `plain-${index}`,
      label: "nfkc-fullwidth",
      input: {
        address: toFullwidth(`${base.number} ${base.street}`),
        city: toFullwidth(base.city),
        state: toFullwidth(base.state),
        zip: toFullwidth(base.zip),
      },
    },
    {
      semanticGroup: `plain-${index}`,
      label: "punctuation-heavy",
      input: {
        address: `${base.number} --- ${base.street.replace(/ /g, " /// ")} !!!`,
        city: `${base.city}...`,
        state: base.state,
        zip: base.zip,
      },
    },
  ];
}

function buildKeywordUnitFixtures(
  base: BaseAddressRecord,
  index: number
): NormalizeAddressFixture[] {
  return [
    {
      semanticGroup: `unit-${index}`,
      label: "apartment",
      input: {
        address: `${base.number} ${base.street} apartment ${base.token.toUpperCase()}`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `unit-${index}`,
      label: "apt",
      input: {
        address: `${base.number} ${base.street} apt ${base.token}`,
        city: ` ${base.city} `,
        state: base.state.toLowerCase(),
        zip: base.zip,
      },
    },
    {
      semanticGroup: `unit-${index}`,
      label: "suite",
      input: {
        address: toFullwidth(
          `${base.number} ${base.street} suite ${base.token.toUpperCase()}`
        ),
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `unit-${index}`,
      label: "ste",
      input: {
        address: `${base.number} ${base.street}\tste ${base.token}\n`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
  ];
}

function buildHashUnitFixtures(
  base: BaseAddressRecord,
  index: number
): NormalizeAddressFixture[] {
  return [
    {
      semanticGroup: `hash-${index}`,
      label: "hash-canonical",
      input: {
        address: `${base.number} ${base.street} # ${base.token.toUpperCase()}`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `hash-${index}`,
      label: "hash-tight",
      input: {
        address: `${base.number} ${base.street} #${base.token}`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `hash-${index}`,
      label: "hash-nfkc",
      input: {
        address: toFullwidth(`${base.number} ${base.street} # ${base.token}`),
        city: toFullwidth(base.city),
        state: base.state,
        zip: base.zip,
      },
    },
    {
      semanticGroup: `hash-${index}`,
      label: "hash-punctuation",
      input: {
        address: `${base.number} ${base.street} \t#   ${base.token} !!!`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      },
    },
  ];
}

const BASE_RECORDS = Array.from({ length: 24 }, (_, index) =>
  buildBaseRecord(index)
);

const FIXTURES = [
  ...BASE_RECORDS.flatMap((base, index) => buildPlainFixtures(base, index)),
  ...BASE_RECORDS.flatMap((base, index) => buildKeywordUnitFixtures(base, index)),
  ...BASE_RECORDS.flatMap((base, index) => buildHashUnitFixtures(base, index)),
  {
    semanticGroup: "null-all",
    label: "all-null",
    input: {
      address: null,
      city: null,
      state: null,
      zip: null,
    },
  },
  {
    semanticGroup: "null-address",
    label: "missing-address",
    input: {
      address: null,
      city: "Null Bay",
      state: "TS",
      zip: "79991",
    },
  },
  {
    semanticGroup: "null-city",
    label: "missing-city",
    input: {
      address: "1700 Partial Path",
      city: null,
      state: "QA",
      zip: "79992",
    },
  },
  {
    semanticGroup: "null-zip",
    label: "missing-zip",
    input: {
      address: "1800 Partial Path # 9A",
      city: "Null Bay",
      state: "NV",
      zip: null,
    },
  },
] satisfies NormalizeAddressFixture[];

describe("search/normalize-address parity contract", () => {
  it("stays deterministic across the fixture corpus", () => {
    const firstRun = FIXTURES.map((fixture) => normalizeAddress(fixture.input));
    const secondRun = FIXTURES.map((fixture) =>
      normalizeAddress({
        address: fixture.input.address,
        city: fixture.input.city,
        state: fixture.input.state,
        zip: fixture.input.zip,
      })
    );

    expect(FIXTURES.length).toBeGreaterThanOrEqual(200);
    expect(secondRun).toEqual(firstRun);
  });

  it("only collapses fixtures inside the same semantic group", () => {
    const normalizedToGroups = new Map<string, Set<string>>();

    for (const fixture of FIXTURES) {
      const normalized = normalizeAddress(fixture.input);
      const groups = normalizedToGroups.get(normalized) ?? new Set<string>();
      groups.add(fixture.semanticGroup);
      normalizedToGroups.set(normalized, groups);
    }

    for (const groups of normalizedToGroups.values()) {
      expect(groups.size).toBe(1);
    }
  });

  it("keeps hash-prefixed unit tokens distinct from keyword unit tokens", () => {
    for (const base of BASE_RECORDS) {
      const keywordValue = normalizeAddress({
        address: `${base.number} ${base.street} apt ${base.token}`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      });
      const hashValue = normalizeAddress({
        address: `${base.number} ${base.street} # ${base.token}`,
        city: base.city,
        state: base.state,
        zip: base.zip,
      });

      expect(hashValue).not.toBe(keywordValue);
    }
  });
});
