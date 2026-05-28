import {
  buildAddressAutocompleteProviderQuery,
  mapPhotonFeatureToAddressSuggestion,
  parseAddressInput,
  searchAddressSuggestions,
  type PhotonAddressFeature,
} from "@/lib/geocoding/address-autocomplete";
import { validateSmartyAddressSuggestionForToken } from "@/lib/geocoding/smarty";
import { verifyAddressSuggestionToken } from "@/lib/geocoding/address-suggestion-token";

const mockFetchWithTimeout = jest.fn();

jest.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

const baseFeature: PhotonAddressFeature = {
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: [-122.4194, 37.7749],
  },
  properties: {
    osm_id: 123,
    osm_type: "N",
    type: "house",
    housenumber: "1555",
    street: "Market St",
    city: "San Francisco",
    state: "California",
    postcode: "94103",
    country: "United States",
  },
};

function photonFeature(
  overrides: Partial<NonNullable<PhotonAddressFeature["properties"]>>,
  coordinates: [number, number] = [-96.9432, 32.8765]
): PhotonAddressFeature {
  return {
    ...baseFeature,
    geometry: { type: "Point", coordinates },
    properties: {
      ...baseFeature.properties,
      country: "United States",
      ...overrides,
    },
  };
}

describe("address autocomplete mapping", () => {
  const originalGooglePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const originalSmartyEnabled = process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED;
  const originalSmartyAuthId = process.env.SMARTY_AUTH_ID;
  const originalSmartyAuthToken = process.env.SMARTY_AUTH_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED;
    delete process.env.SMARTY_AUTH_ID;
    delete process.env.SMARTY_AUTH_TOKEN;
  });

  afterAll(() => {
    if (originalGooglePlacesApiKey === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = originalGooglePlacesApiKey;
    }
    if (originalSmartyEnabled === undefined) {
      delete process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED;
    } else {
      process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED = originalSmartyEnabled;
    }
    if (originalSmartyAuthId === undefined) {
      delete process.env.SMARTY_AUTH_ID;
    } else {
      process.env.SMARTY_AUTH_ID = originalSmartyAuthId;
    }
    if (originalSmartyAuthToken === undefined) {
      delete process.env.SMARTY_AUTH_TOKEN;
    } else {
      process.env.SMARTY_AUTH_TOKEN = originalSmartyAuthToken;
    }
  });

  it("maps a Photon house result into editable address fields without exposing exact coordinates", () => {
    const suggestion = mapPhotonFeatureToAddressSuggestion(baseFeature, {
      userId: "user-123",
      now: 1_000_000,
    });

    expect(suggestion).toMatchObject({
      id: "N:123",
      label: "1555 Market St, San Francisco, California 94103",
      primaryText: "1555 Market St",
      secondaryText: "San Francisco, California 94103",
      address: "1555 Market St",
      city: "San Francisco",
      state: "California",
      zip: "94103",
      precision: "PREMISE",
    });
    expect(suggestion).not.toHaveProperty("lat");
    expect(suggestion).not.toHaveProperty("lng");
    expect(suggestion).not.toHaveProperty("addressSuggestionToken");
  });

  it("uses Smarty first and normalizes secondary expansion suggestions", async () => {
    process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED = "true";
    process.env.SMARTY_AUTH_ID = "smarty-id";
    process.env.SMARTY_AUTH_TOKEN = "smarty-token";
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            street_line: "1042 W Center St",
            secondary: "Apt",
            city: "Orem",
            state: "UT",
            zipcode: "84057",
            entries: 108,
          },
        ],
      }),
    });

    const suggestions = await searchAddressSuggestions("1042 W Center St", {
      userId: "user-123",
      limit: 5,
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        provider: "smarty",
        address: "1042 W Center St Apt",
        entries: 108,
        requiresSecondaryExpansion: true,
        requiresResolution: false,
        selected: "1042 W Center St Apt (108) Orem UT 84057",
      }),
    ]);
    const [url, init] = mockFetchWithTimeout.mock.calls[0];
    expect(new URL(url).hostname).toBe("us-autocomplete-pro.api.smarty.com");
    expect(init).toMatchObject({
      headers: {
        Authorization: expect.stringMatching(/^Basic /),
      },
    });
    expect(JSON.stringify(suggestions)).not.toContain("-96.9432");
    expect(JSON.stringify(suggestions)).not.toContain("addressSuggestionToken");
  });

  it("validates a Smarty-selected address and returns a signed token without exposing coordinates", async () => {
    process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED = "true";
    process.env.SMARTY_AUTH_ID = "smarty-id";
    process.env.SMARTY_AUTH_TOKEN = "smarty-token";
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          delivery_line_1: "1121 Hidden Rdg",
          components: {
            city_name: "Irving",
            state_abbreviation: "TX",
            zipcode: "75038",
          },
          metadata: {
            latitude: 32.862294,
            longitude: -96.958742,
            precision: "Rooftop",
          },
          analysis: {
            dpv_match_code: "Y",
          },
        },
      ],
    });

    const suggestion = await validateSmartyAddressSuggestionForToken({
      userId: "user-123",
      sourceId: "smarty:hidden-rdg",
      address: "1121 Hidden Rdg",
      city: "Irving",
      state: "TX",
      zip: "75038",
      typedAddress: "1121 Hidden Rdg",
      placeId: "smarty:hidden-rdg",
    });

    expect(suggestion).toMatchObject({
      id: "smarty:hidden-rdg",
      address: "1121 Hidden Rdg",
      city: "Irving",
      state: "TX",
      zip: "75038",
      precision: "PREMISE",
      provider: "smarty",
      requiresResolution: false,
    });
    expect(suggestion?.addressSuggestionToken).toEqual(expect.any(String));
    expect(JSON.stringify(suggestion)).not.toContain("32.862294");
    expect(JSON.stringify(suggestion)).not.toContain("-96.958742");
    expect(
      verifyAddressSuggestionToken(suggestion?.addressSuggestionToken, {
        userId: "user-123",
        address: "1121 Hidden Rdg",
        city: "Irving",
        state: "TX",
        zip: "75038",
        now: Date.now(),
      })
    ).toMatchObject({
      valid: true,
      coords: { lat: 32.862294, lng: -96.958742 },
    });

    const [url, init] = mockFetchWithTimeout.mock.calls[0];
    const requestUrl = new URL(url);
    expect(requestUrl.hostname).toBe("us-street.api.smarty.com");
    expect(requestUrl.searchParams.get("street")).toBe("1121 Hidden Rdg");
    expect(requestUrl.searchParams.get("city")).toBe("Irving");
    expect(requestUrl.searchParams.get("state")).toBe("TX");
    expect(requestUrl.searchParams.get("zipcode")).toBe("75038");
    expect(requestUrl.searchParams.get("candidates")).toBe("1");
    expect(init).toMatchObject({
      headers: {
        Authorization: expect.stringMatching(/^Basic /),
      },
    });
  });

  it("rejects empty or unrecognized-secondary Smarty street validation candidates", async () => {
    process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED = "true";
    process.env.SMARTY_AUTH_ID = "smarty-id";
    process.env.SMARTY_AUTH_TOKEN = "smarty-token";
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            delivery_line_1: "1121 Hidden Rdg Apt 999",
            components: {
              city_name: "Irving",
              state_abbreviation: "TX",
              zipcode: "75038",
            },
            metadata: {
              latitude: 32.862294,
              longitude: -96.958742,
            },
            analysis: {
              dpv_match_code: "S",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      });

    await expect(
      validateSmartyAddressSuggestionForToken({
        userId: "user-123",
        sourceId: "smarty:hidden-rdg",
        address: "1121 Hidden Rdg Apt 999",
        city: "Irving",
        state: "TX",
        zip: "75038",
      })
    ).resolves.toBeNull();
    await expect(
      validateSmartyAddressSuggestionForToken({
        userId: "user-123",
        sourceId: "smarty:hidden-rdg",
        address: "1121 Hidden Rdg",
        city: "Irving",
        state: "TX",
        zip: "75038",
      })
    ).resolves.toBeNull();
  });

  it("surfaces capped and upstream Smarty street validation failures", async () => {
    process.env.SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED = "true";
    process.env.SMARTY_AUTH_ID = "smarty-id";
    process.env.SMARTY_AUTH_TOKEN = "smarty-token";
    mockFetchWithTimeout
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
    const input = {
      userId: "user-123",
      sourceId: "smarty:hidden-rdg",
      address: "1121 Hidden Rdg",
      city: "Irving",
      state: "TX",
      zip: "75038",
    };

    await expect(
      validateSmartyAddressSuggestionForToken(input)
    ).rejects.toMatchObject({
      code: "CAPPED",
    });
    await expect(
      validateSmartyAddressSuggestionForToken(input)
    ).rejects.toMatchObject({
      name: "SmartyAddressAutocompleteUnavailableError",
      code: "UPSTREAM",
    });
  });

  it("maps a Photon street result but does not mark it as premise-verified", () => {
    const suggestion = mapPhotonFeatureToAddressSuggestion(
      {
        ...baseFeature,
        properties: {
          ...baseFeature.properties,
          type: "street",
          housenumber: undefined,
        },
      },
      { userId: "user-123", now: 1_000_000 }
    );

    expect(suggestion).toMatchObject({
      address: "Market St",
      precision: "STREET",
    });
  });

  it("drops non-US results and features without street address components", () => {
    expect(
      mapPhotonFeatureToAddressSuggestion(
        {
          ...baseFeature,
          properties: { ...baseFeature.properties, country: "Canada" },
        },
        { userId: "user-123", now: 1_000_000 }
      )
    ).toBeNull();

    expect(
      mapPhotonFeatureToAddressSuggestion(
        {
          ...baseFeature,
          properties: {
            ...baseFeature.properties,
            type: "city",
            housenumber: undefined,
            street: undefined,
            name: "San Francisco",
          },
        },
        { userId: "user-123", now: 1_000_000 }
      )
    ).toBeNull();
  });

  it("strips a trailing apartment suffix before querying Photon", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [baseFeature] }),
    });

    await searchAddressSuggestions("1555 Market St, Apt 4", {
      userId: "user-123",
      limit: 5,
    });

    const requestUrl = new URL(mockFetchWithTimeout.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("q")).toBe("1555 Market St");
  });

  it("deduplicates repeated Photon suggestions before returning them", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [baseFeature, baseFeature] }),
    });

    const suggestions = await searchAddressSuggestions("1555 Market St", {
      userId: "user-123",
      limit: 5,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: "N:123",
      label: "1555 Market St, San Francisco, California 94103",
    });
  });

  it("parses a full address typed into the street field", () => {
    expect(parseAddressInput("1121 Hidden Ridge, Irving, TX")).toMatchObject({
      address: "1121 Hidden Ridge",
      city: "Irving",
      state: "TX",
      zip: "",
      unitSuffix: null,
    });

    expect(
      parseAddressInput("1121 Hidden Ridge, Irving, TX 75038")
    ).toMatchObject({
      address: "1121 Hidden Ridge",
      city: "Irving",
      state: "TX",
      zip: "75038",
      unitSuffix: null,
    });

    expect(
      parseAddressInput("1121 Hidden Ridge, Irving, TX, APT 1074")
    ).toMatchObject({
      address: "1121 Hidden Ridge",
      city: "Irving",
      state: "TX",
      zip: "",
      unitSuffix: "APT 1074",
    });

    expect(parseAddressInput("1121 Hidden Ridge")).toMatchObject({
      address: "1121 Hidden Ridge",
      city: "",
      state: "",
      zip: "",
      unitSuffix: null,
    });
  });

  it("builds provider queries from street input and city/state context", () => {
    expect(
      buildAddressAutocompleteProviderQuery("1121 Hidden Ridge", {
        city: "Irving",
        state: "TX",
      })
    ).toBe("1121 Hidden Ridge, Irving, TX");

    expect(
      buildAddressAutocompleteProviderQuery(
        "1121 Hidden Ridge, Irving, TX, APT 1074",
        { city: "Dallas", state: "TX" }
      )
    ).toBe("1121 Hidden Ridge, Irving, TX");
  });

  it("ranks exact street matches above fuzzy matches and filters out other states when state is supplied", async () => {
    const fuzzyTexasFeature = photonFeature({
      osm_id: 201,
      osm_type: "W",
      housenumber: "1121",
      street: "Hidden Creek Drive",
      city: "Allen",
      state: "Texas",
      postcode: "75003",
    });
    const outOfStateFeature = photonFeature(
      {
        osm_id: 202,
        osm_type: "W",
        housenumber: "1121",
        street: "Hidden Valley Drive",
        city: "Sandy",
        state: "Utah",
        postcode: "84094",
      },
      [-111.9, 40.57]
    );
    const exactFeature = photonFeature({
      osm_id: 203,
      osm_type: "W",
      housenumber: "1121",
      street: "Hidden Ridge",
      city: "Irving",
      state: "Texas",
      postcode: "75038",
    });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [fuzzyTexasFeature, outOfStateFeature, exactFeature],
      }),
    });

    const suggestions = await searchAddressSuggestions(
      "1121 Hidden Ridge, Irving, TX",
      {
        userId: "user-123",
        limit: 5,
      }
    );

    expect(suggestions.map((suggestion) => suggestion.address)).toEqual([
      "1121 Hidden Ridge",
      "1121 Hidden Creek Drive",
    ]);
    expect(suggestions[0]).toMatchObject({
      city: "Irving",
      state: "Texas",
      zip: "75038",
    });
  });
});
