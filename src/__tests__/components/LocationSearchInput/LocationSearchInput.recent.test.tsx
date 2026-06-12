/**
 * LocationSearchInput - Recent-on-empty-focus mode
 *
 * Covers the opt-in `showFallbackOnEmptyFocus` mode used by the homepage
 * SearchForm to surface recent searches inside the accessible combobox
 * listbox (keyboard-navigable + announced), replacing the former mouse-only
 * dropdown. Default-off behavior is asserted so other consumers are unaffected.
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

const makeFallbackItems = () => {
  const onSelectA = jest.fn();
  const onSelectB = jest.fn();
  return {
    onSelectA,
    onSelectB,
    items: [
      {
        id: "r1",
        primaryText: "Austin, TX",
        secondaryText: "Recent search",
        onSelect: onSelectA,
      },
      {
        id: "r2",
        primaryText: "Seattle, WA",
        secondaryText: "Recent search",
        onSelect: onSelectB,
      },
    ],
  };
};

describe("LocationSearchInput - recent-on-empty-focus", () => {
  const user = userEvent.setup({ delay: null });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
    clearCache();
    // Empty input never triggers a fetch, but keep a benign default.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: "FeatureCollection", features: [] }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows recent items as an accessible listbox on empty focus when opted in", async () => {
    const { items } = makeFallbackItems();
    render(
      <ControlledLocationInput
        fallbackItems={items}
        fallbackTitle="Recent searches"
        showFallbackOnEmptyFocus
      />
    );

    await user.click(screen.getByRole("combobox"));

    const listbox = await screen.findByRole("listbox", {
      name: "Recent searches",
    });
    expect(listbox).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.getByText("Austin, TX")).toBeInTheDocument();
    expect(screen.getByText("Seattle, WA")).toBeInTheDocument();
    // No fetch for an empty query.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("navigates recents with ArrowDown and selects with Enter", async () => {
    const { items, onSelectA } = makeFallbackItems();
    render(
      <ControlledLocationInput
        fallbackItems={items}
        fallbackTitle="Recent searches"
        showFallbackOnEmptyFocus
      />
    );

    const input = screen.getByRole("combobox");
    await user.click(input);
    await screen.findByRole("listbox", { name: "Recent searches" });

    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toMatch(/option-0$/);
    });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.keyboard("{Enter}");
    expect(onSelectA).toHaveBeenCalledTimes(1);
  });

  it("invokes onClearFallback from the recent header Clear button", async () => {
    const { items } = makeFallbackItems();
    const onClearFallback = jest.fn();
    render(
      <ControlledLocationInput
        fallbackItems={items}
        fallbackTitle="Recent searches"
        showFallbackOnEmptyFocus
        onClearFallback={onClearFallback}
      />
    );

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("listbox", { name: "Recent searches" });

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(onClearFallback).toHaveBeenCalledTimes(1);
  });

  it("does NOT show fallback items on empty focus when not opted in (default)", async () => {
    const { items } = makeFallbackItems();
    render(
      <ControlledLocationInput
        fallbackItems={items}
        fallbackTitle="Recent searches"
      />
    );

    await user.click(screen.getByRole("combobox"));
    // Give effects a chance to run.
    jest.advanceTimersByTime(350);

    expect(
      screen.queryByRole("listbox", { name: "Recent searches" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Austin, TX")).not.toBeInTheDocument();
  });
});
