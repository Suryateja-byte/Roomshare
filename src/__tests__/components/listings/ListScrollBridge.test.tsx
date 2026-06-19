import { act, fireEvent, render, screen } from "@testing-library/react";
import ListScrollBridge from "@/components/listings/ListScrollBridge";
import {
  ListingFocusProvider,
  useListingFocus,
} from "@/contexts/ListingFocusContext";

// Polyfill scrollIntoView for jsdom (not implemented natively)
const mockScrollIntoView = jest.fn();
beforeEach(() => {
  mockScrollIntoView.mockClear();
  // Reset matchMedia to the default (no reduced-motion preference)
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
  HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
});

function ScrollTrigger() {
  const { requestScrollTo } = useListingFocus();

  return (
    <button type="button" onClick={() => requestScrollTo("listing-123")}>
      Scroll to listing
    </button>
  );
}

function renderBridge() {
  render(
    <ListingFocusProvider>
      <ListScrollBridge />
      <div data-testid="map-pin" data-listing-id="listing-123" />
      <div
        data-testid="scroll-container"
        data-search-scroll-container="true"
        style={{ scrollPaddingTop: "16px", scrollPaddingBottom: "24px" }}
      >
        <article
          data-testid="listing-card"
          data-listing-id="listing-123"
          data-listing-card-id="listing-123"
        />
      </div>
      <ScrollTrigger />
    </ListingFocusProvider>
  );

  return {};
}

describe("ListScrollBridge", () => {
  it("scrolls the target card into view when scroll is requested", async () => {
    renderBridge();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scroll to listing" }));
    });

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });

  it("does not scroll when no scroll request is pending", () => {
    renderBridge();

    // No click = no scroll request
    expect(mockScrollIntoView).not.toHaveBeenCalled();
  });

  it("uses behavior:'auto' when prefers-reduced-motion is active", async () => {
    // Override matchMedia to report reduced-motion preference
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    renderBridge();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scroll to listing" }));
    });

    // Must use "auto" (instant jump), not "smooth", to honour the user's
    // motion preference — JS behavior:"smooth" bypasses the CSS
    // scroll-behavior:auto !important guard in globals.css.
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
    });
  });
});
