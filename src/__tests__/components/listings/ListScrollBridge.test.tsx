import { act, fireEvent, render, screen } from "@testing-library/react";
import ListScrollBridge from "@/components/listings/ListScrollBridge";
import {
  ListingFocusProvider,
  useListingFocus,
} from "@/contexts/ListingFocusContext";

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

  const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
  const card = screen.getByTestId("listing-card") as HTMLElement;
  const mapPin = screen.getByTestId("map-pin") as HTMLElement;
  const scrollTo = jest.fn();
  const markerScrollIntoView = jest.fn();

  Object.defineProperty(scrollContainer, "scrollTop", {
    configurable: true,
    writable: true,
    value: 120,
  });
  Object.defineProperty(scrollContainer, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(mapPin, "scrollIntoView", {
    configurable: true,
    value: markerScrollIntoView,
  });

  return { scrollContainer, card, scrollTo, markerScrollIntoView };
}

function createRect(top: number, bottom: number) {
  return {
    top,
    bottom,
    left: 0,
    right: 320,
    width: 320,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

describe("ListScrollBridge", () => {
  it("scrolls within the nearest search results container using scroll padding", async () => {
    const { scrollContainer, card, scrollTo, markerScrollIntoView } =
      renderBridge();

    scrollContainer.getBoundingClientRect = jest.fn(() => createRect(200, 700));
    card.getBoundingClientRect = jest.fn(() => createRect(460, 820));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scroll to listing" }));
    });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 364,
      behavior: "smooth",
    });
    expect(markerScrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll again when the target card is already fully visible", async () => {
    const { scrollContainer, card, scrollTo } = renderBridge();

    scrollContainer.getBoundingClientRect = jest.fn(() => createRect(200, 700));
    card.getBoundingClientRect = jest.fn(() => createRect(250, 620));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Scroll to listing" }));
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
