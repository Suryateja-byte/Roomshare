/**
 * LocationSearchInput - aria-expanded / aria-controls listbox contract
 *
 * Regression tests for fix #13: the combobox must NOT advertise
 * aria-expanded=true or a dangling aria-controls IDREF when only a
 * role="status" panel is open (type-more hint, no-results, unavailable
 * without fallback).  aria-expanded must be true and aria-controls must
 * point to an existing listbox only when an actual listbox renders.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LocationSearchInput from "@/components/LocationSearchInput";
import { clearCache } from "@/lib/geocoding-cache";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ControlledLocationInput = ({
  initialValue = "",
  ...props
}: {
  initialValue?: string;
} & Partial<React.ComponentProps<typeof LocationSearchInput>>) => {
  const [value, setValue] = React.useState(initialValue);
  return <LocationSearchInput value={value} onChange={setValue} {...props} />;
};

const mockSuggestions = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
      properties: {
        osm_id: 1,
        osm_type: "R",
        name: "San Francisco",
        state: "CA",
        country: "USA",
        type: "city",
      },
    },
  ],
};

describe("LocationSearchInput - aria-expanded / aria-controls listbox contract", () => {
  const user = userEvent.setup({ delay: null });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    clearCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: get the combobox input element
  const getInput = () => screen.getByRole("combobox");

  // --- States that must NOT advertise a listbox ---

  it("aria-expanded is false and aria-controls is absent before any interaction", () => {
    render(<ControlledLocationInput />);
    const input = getInput();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  it("type-more hint: aria-expanded=false and no aria-controls (status panel, not a listbox)", async () => {
    // API won't be called for short queries but ensure it returns nothing
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    });

    render(<ControlledLocationInput />);
    await user.click(getInput());
    // Type a single character — below LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH (2)
    await user.type(getInput(), "a");

    await waitFor(() => {
      expect(
        screen.getByText(/Type at least/i)
      ).toBeInTheDocument();
    });

    const input = getInput();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  it("no-results state: aria-expanded=false and no aria-controls (status panel, not a listbox)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    });

    render(<ControlledLocationInput />);
    await user.click(getInput());
    await user.type(getInput(), "xyzzy");

    // Advance debounce + fetch
    await waitFor(
      () => {
        expect(screen.getByText("No locations found")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    const input = getInput();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  // --- States that MUST advertise a listbox ---

  it("suggestions list: aria-expanded=true and aria-controls points to a rendered listbox", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSuggestions,
    });

    render(<ControlledLocationInput />);
    await user.click(getInput());
    await user.type(getInput(), "San");

    await waitFor(
      () => {
        expect(
          screen.getByRole("listbox", { name: /location suggestions/i })
        ).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    const input = getInput();
    expect(input).toHaveAttribute("aria-expanded", "true");

    const controlsId = input.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    // The element the combobox advertises must actually exist in the DOM
    expect(document.getElementById(controlsId!)).not.toBeNull();
    expect(document.getElementById(controlsId!)?.getAttribute("role")).toBe(
      "listbox"
    );
  });

  it("recent-list (showFallbackOnEmptyFocus): aria-expanded=true and listbox exists on empty focus", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    });

    const fallbackItems = [
      {
        id: "r1",
        primaryText: "Austin, TX",
        secondaryText: "Recent search",
        onSelect: jest.fn(),
      },
    ];

    render(
      <ControlledLocationInput
        fallbackItems={fallbackItems}
        fallbackTitle="Recent searches"
        showFallbackOnEmptyFocus
      />
    );

    await user.click(getInput());

    await waitFor(() => {
      expect(screen.getByText("Austin, TX")).toBeInTheDocument();
    });

    const input = getInput();
    expect(input).toHaveAttribute("aria-expanded", "true");

    const controlsId = input.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId!)).not.toBeNull();
    expect(document.getElementById(controlsId!)?.getAttribute("role")).toBe(
      "listbox"
    );
  });
});
