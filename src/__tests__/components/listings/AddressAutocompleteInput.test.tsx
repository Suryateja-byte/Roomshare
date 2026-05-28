import React, { useState } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddressAutocompleteInput, {
  type AddressAutocompleteSelection,
} from "@/components/listings/AddressAutocompleteInput";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function Harness({
  initialCity = "",
  initialState = "",
  initialZip = "",
}: {
  initialCity?: string;
  initialState?: string;
  initialZip?: string;
} = {}) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [zip, setZip] = useState(initialZip);
  const [token, setToken] = useState<string | undefined>(undefined);

  const handleSelect = (suggestion: AddressAutocompleteSelection) => {
    setAddress(suggestion.address);
    setCity(suggestion.city);
    setState(suggestion.state);
    setZip(suggestion.zip);
    setToken(suggestion.addressSuggestionToken);
  };

  return (
    <div>
      <AddressAutocompleteInput
        id="address"
        name="address"
        value={address}
        city={city}
        state={state}
        zip={zip}
        onChange={setAddress}
        onManualEdit={() => setToken(undefined)}
        onSuggestionSelect={handleSelect}
      />
      <input aria-label="City" value={city} readOnly />
      <input aria-label="State" value={state} readOnly />
      <input aria-label="Zip Code" value={zip} readOnly />
      <output data-testid="token">{token ?? ""}</output>
    </div>
  );
}

describe("AddressAutocompleteInput", () => {
  const user = userEvent.setup({ delay: null });
  const marketSuggestion = {
    id: "N:123",
    label: "1555 Market St, San Francisco, CA 94103",
    primaryText: "1555 Market St",
    secondaryText: "San Francisco, CA 94103",
    address: "1555 Market St",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    lat: 37.7749,
    lng: -122.4194,
    precision: "PREMISE",
    addressSuggestionToken: "signed-token",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [marketSuggestion],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fetches private address suggestions and selects one to populate fields", async () => {
    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1555 Market");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch.mock.calls[0][0]).toContain(
      "/api/geocoding/address-autocomplete"
    );

    await user.click(
      await screen.findByRole("button", { name: /1555 Market St/i })
    );

    await waitFor(() => {
      expect(addressInput).toHaveValue("1555 Market St");
      expect(screen.getByLabelText("City")).toHaveValue("San Francisco");
      expect(screen.getByLabelText("State")).toHaveValue("CA");
      expect(screen.getByLabelText("Zip Code")).toHaveValue("94103");
      expect(screen.getByTestId("token")).toHaveTextContent("signed-token");
    });
  });

  it("resolves Google address details before filling fields and token", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              id: "google:ChIJAddress",
              label: "1121 Hidden Ridge, Irving, TX 75038",
              primaryText: "1121 Hidden Ridge",
              secondaryText: "Irving, TX 75038",
              address: "1121 Hidden Ridge",
              city: "",
              state: "",
              zip: "",
              lat: 0,
              lng: 0,
              precision: "STREET",
              provider: "google",
              placeId: "ChIJAddress",
              requiresResolution: true,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestion: {
            id: "google:ChIJAddress",
            label: "1121 Hidden Ridge, Apt 1074, Irving, TX 75038",
            primaryText: "1121 Hidden Ridge, Apt 1074",
            secondaryText: "Irving, TX 75038",
            address: "1121 Hidden Ridge, Apt 1074",
            city: "Irving",
            state: "TX",
            zip: "75038",
            lat: 32.8765,
            lng: -96.9432,
            precision: "PREMISE",
            provider: "google",
            placeId: "ChIJAddress",
            requiresResolution: false,
            addressSuggestionToken: "google-token",
          },
        }),
      });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 Hidden Ridge, Apt 1074");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await user.click(
      await screen.findByRole("button", { name: /1121 Hidden Ridge/i })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toBe("/api/geocoding/address-details");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual(
      expect.objectContaining({
        placeId: "ChIJAddress",
        provider: "google",
        address: "1121 Hidden Ridge",
        typedAddress: "1121 Hidden Ridge, Apt 1074",
      })
    );
    await waitFor(() => {
      expect(addressInput).toHaveValue("1121 Hidden Ridge, Apt 1074");
      expect(screen.getByLabelText("City")).toHaveValue("Irving");
      expect(screen.getByLabelText("State")).toHaveValue("TX");
      expect(screen.getByLabelText("Zip Code")).toHaveValue("75038");
      expect(screen.getByTestId("token")).toHaveTextContent("google-token");
    });
  });

  it("expands Smarty multi-unit suggestions before creating a trusted token", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              id: "smarty:base",
              label: "1042 W Center St Apt (108 entries), Orem, UT 84057",
              primaryText: "1042 W Center St Apt (108 entries)",
              secondaryText: "Orem, UT 84057",
              address: "1042 W Center St Apt",
              city: "Orem",
              state: "UT",
              zip: "84057",
              precision: "PREMISE",
              provider: "smarty",
              requiresResolution: false,
              requiresSecondaryExpansion: true,
              entries: 108,
              selected: "1042 W Center St Apt (108) Orem UT 84057",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              id: "smarty:unit",
              label: "1042 W Center St Apt A101, Orem, UT 84057",
              primaryText: "1042 W Center St Apt A101",
              secondaryText: "Orem, UT 84057",
              address: "1042 W Center St Apt A101",
              city: "Orem",
              state: "UT",
              zip: "84057",
              precision: "PREMISE",
              provider: "smarty",
              requiresResolution: true,
            },
          ],
        }),
      });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1042 W Center");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await user.click(
      await screen.findByRole("button", { name: /108 entries/i })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const expansionUrl = new URL(
      mockFetch.mock.calls[1][0],
      "http://localhost"
    );
    expect(expansionUrl.searchParams.get("selected")).toBe(
      "1042 W Center St Apt (108) Orem UT 84057"
    );
    expect(addressInput).toHaveValue("1042 W Center St Apt");
    expect(
      await screen.findByRole("button", { name: /Apt A101/i })
    ).toBeVisible();
    expect(screen.getByTestId("token")).toHaveTextContent("");
  });

  it("resolves a selected Smarty address without showing suggestions unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              id: "smarty:hidden-rdg",
              label: "1121 Hidden Rdg, Irving, TX 75038",
              primaryText: "1121 Hidden Rdg",
              secondaryText: "Irving, TX 75038",
              address: "1121 Hidden Rdg",
              city: "Irving",
              state: "TX",
              zip: "75038",
              precision: "PREMISE",
              provider: "smarty",
              placeId: "smarty:hidden-rdg",
              requiresResolution: true,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          suggestion: {
            id: "smarty:hidden-rdg",
            label: "1121 Hidden Rdg, Irving, TX 75038",
            primaryText: "1121 Hidden Rdg",
            secondaryText: "Irving, TX 75038",
            address: "1121 Hidden Rdg",
            city: "Irving",
            state: "TX",
            zip: "75038",
            precision: "PREMISE",
            provider: "smarty",
            placeId: "smarty:hidden-rdg",
            requiresResolution: false,
            addressSuggestionToken: "smarty-token",
          },
        }),
      });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 hidden rid");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await user.click(
      await screen.findByRole("button", { name: /1121 Hidden Rdg/i })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toBe("/api/geocoding/address-details");
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual(
      expect.objectContaining({
        provider: "smarty",
        sourceId: "smarty:hidden-rdg",
        address: "1121 Hidden Rdg",
        city: "Irving",
        state: "TX",
        zip: "75038",
        typedAddress: "1121 Hidden Rdg",
      })
    );
    await waitFor(() => {
      expect(addressInput).toHaveValue("1121 Hidden Rdg");
      expect(screen.getByLabelText("City")).toHaveValue("Irving");
      expect(screen.getByLabelText("State")).toHaveValue("TX");
      expect(screen.getByLabelText("Zip Code")).toHaveValue("75038");
      expect(screen.getByTestId("token")).toHaveTextContent("smarty-token");
    });
    expect(
      screen.queryByText(/address suggestions unavailable/i)
    ).not.toBeInTheDocument();
  });

  it("clears the selected token when the user edits the address after selecting", async () => {
    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1555 Market");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    await user.click(
      await screen.findByRole("button", { name: /1555 Market St/i })
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent("signed-token")
    );

    await user.type(addressInput, " Apt 4");

    expect(screen.getByTestId("token")).toHaveTextContent("");
    expect(addressInput).toHaveValue("1555 Market St Apt 4");
  });

  it("keeps manual entry usable when suggestions are unavailable", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("network down"));
    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1555 Market");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(await screen.findByText(/suggestions unavailable/i)).toBeVisible();
    expect(addressInput).toHaveValue("1555 Market");
  });

  it("deduplicates repeated API suggestions before rendering listbox options", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [marketSuggestion, marketSuggestion],
      }),
    });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1555 Market");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(screen.getAllByText("1555 Market St")).toHaveLength(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.join(" ").includes("Encountered two children with the same key")
      )
    ).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it("preserves a trailing apartment suffix when selecting a base address suggestion", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            id: "W:987",
            label: "1121 Hidden Ridge, Irving, TX 75038",
            primaryText: "1121 Hidden Ridge",
            secondaryText: "Irving, TX 75038",
            address: "1121 Hidden Ridge",
            city: "Irving",
            state: "TX",
            zip: "75038",
            lat: 32.8765,
            lng: -96.9432,
            precision: "PREMISE",
            addressSuggestionToken: "irving-token",
          },
        ],
      }),
    });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 hidden ridge, Irving Tx, APT 1074");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const requestUrl = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(requestUrl.searchParams.get("q")).toBe(
      "1121 hidden ridge, Irving, TX"
    );

    await user.click(
      await screen.findByRole("button", { name: /1121 Hidden Ridge/i })
    );

    await waitFor(() => {
      expect(addressInput).toHaveValue("1121 Hidden Ridge, APT 1074");
      expect(screen.getByLabelText("City")).toHaveValue("Irving");
      expect(screen.getByLabelText("State")).toHaveValue("TX");
      expect(screen.getByLabelText("Zip Code")).toHaveValue("75038");
      expect(screen.getByTestId("token")).toHaveTextContent("irving-token");
    });
  });

  it("uses existing city and state fields as provider search context", async () => {
    render(<Harness initialCity="Irving" initialState="TX" />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 Hidden Ridge");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const requestUrl = new URL(mockFetch.mock.calls[0][0], "http://localhost");
    expect(requestUrl.searchParams.get("q")).toBe(
      "1121 Hidden Ridge, Irving, TX"
    );
  });

  it("offers a manual typed-address option when provider suggestions do not exactly match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            id: "W:201",
            label: "1121 Hidden Creek Drive, Allen, TX 75003",
            primaryText: "1121 Hidden Creek Drive",
            secondaryText: "Allen, TX 75003",
            address: "1121 Hidden Creek Drive",
            city: "Allen",
            state: "TX",
            zip: "75003",
            lat: 33.1032,
            lng: -96.6706,
            precision: "PREMISE",
            addressSuggestionToken: "wrong-token",
          },
        ],
      }),
    });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 Hidden Ridge, Irving, TX");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await user.click(
      await screen.findByRole("button", { name: /use typed address/i })
    );

    expect(addressInput).toHaveValue("1121 Hidden Ridge");
    expect(screen.getByLabelText("City")).toHaveValue("Irving");
    expect(screen.getByLabelText("State")).toHaveValue("TX");
    expect(screen.getByLabelText("Zip Code")).toHaveValue("");
    expect(screen.getByTestId("token")).toHaveTextContent("");
  });

  it("does not show the manual typed-address option when a provider result exactly matches", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            id: "W:987",
            label: "1121 Hidden Ridge, Irving, TX 75038",
            primaryText: "1121 Hidden Ridge",
            secondaryText: "Irving, TX 75038",
            address: "1121 Hidden Ridge",
            city: "Irving",
            state: "TX",
            zip: "75038",
            lat: 32.8765,
            lng: -96.9432,
            precision: "PREMISE",
            addressSuggestionToken: "irving-token",
          },
        ],
      }),
    });

    render(<Harness />);
    const addressInput = screen.getByRole("combobox");

    await user.type(addressInput, "1121 Hidden Ridge, Irving, TX");
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await screen.findByRole("button", { name: /1121 Hidden Ridge/i });
    expect(
      screen.queryByRole("button", { name: /use typed address/i })
    ).not.toBeInTheDocument();
  });
});
