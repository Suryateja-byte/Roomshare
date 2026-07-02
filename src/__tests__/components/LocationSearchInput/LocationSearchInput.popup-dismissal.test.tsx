/**
 * LocationSearchInput - Popup dismissal regression tests
 *
 * The suggestions popup is a fixed-position, z-[9999] portal that can sit on
 * top of the surrounding form's own controls (mobile overlay: the Search
 * button). These tests pin the dismissal contract that keeps it from
 * swallowing taps:
 *  - form submit closes the popup
 *  - Escape closes only the popup (no bubbling to an enclosing dialog)
 *  - mousedown on popup dead chrome dismisses instead of silently swallowing
 *  - status-only popups (type-more hint) let pointer events pass through
 */
import React, { useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LocationSearchInput from "@/components/LocationSearchInput";

jest.mock("@/lib/geocoding-cache", () => ({
  getCachedResults: jest.fn(() => null),
  setCachedResults: jest.fn(),
  clearCache: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockPhotonSuggestions = {
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

function FormWrapper({ onSubmit }: { onSubmit?: jest.Mock }) {
  const [value, setValue] = useState("");

  return (
    <form
      data-testid="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <LocationSearchInput value={value} onChange={setValue} />
      <button type="submit">Search</button>
    </form>
  );
}

async function openSuggestions(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole("combobox");
  await user.type(input, "San");
  jest.advanceTimersByTime(350);
  await waitFor(() => {
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
  return input;
}

describe("LocationSearchInput - popup dismissal", () => {
  const user = userEvent.setup({ delay: null });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPhotonSuggestions,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("closes the popup when the surrounding form submits", async () => {
    const onSubmit = jest.fn();
    render(<FormWrapper onSubmit={onSubmit} />);
    await openSuggestions(user);

    fireEvent.submit(screen.getByTestId("search-form"));

    expect(onSubmit).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("Escape with the popup open closes only the popup and does not reach window listeners", async () => {
    const windowEscapeSpy = jest.fn();
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") windowEscapeSpy();
    };
    window.addEventListener("keydown", handleWindowKeyDown);

    try {
      render(<FormWrapper />);
      const input = await openSuggestions(user);

      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
      expect(windowEscapeSpy).not.toHaveBeenCalled();

      // With the popup closed, Escape propagates so an enclosing dialog
      // (mobile search overlay) can handle it.
      fireEvent.keyDown(input, { key: "Escape" });
      expect(windowEscapeSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", handleWindowKeyDown);
    }
  });

  it("dismisses the popup on mousedown on its dead chrome instead of swallowing the press", async () => {
    render(<FormWrapper />);
    await openSuggestions(user);

    const popup = document.querySelector(
      '[data-location-search-popup="true"]'
    );
    expect(popup).not.toBeNull();

    // Press on the popup container itself (padding/dead space, not a button).
    fireEvent.mouseDown(popup as Element);

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("keeps the popup open on mousedown on a suggestion so click-selection still works", async () => {
    render(<FormWrapper />);
    await openSuggestions(user);

    const option = screen.getByText("San Francisco");
    fireEvent.mouseDown(option);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("renders the type-more hint with pointer-events disabled so taps reach controls underneath", async () => {
    render(<FormWrapper />);
    const input = screen.getByRole("combobox");

    // 1 char < LOCATION_AUTOCOMPLETE_MIN_QUERY_LENGTH (2) → hint popup
    await user.type(input, "S");
    jest.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const hint = document.querySelector(
      '[data-location-search-popup="true"]'
    );
    expect(hint).not.toBeNull();
    expect(hint).toHaveClass("pointer-events-none");
  });
});
