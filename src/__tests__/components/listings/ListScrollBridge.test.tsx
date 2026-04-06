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

// Mock scrollIntoView globally (JSDOM doesn't implement it)
const scrollIntoViewMock = jest.fn();
beforeEach(() => {
  scrollIntoViewMock.mockClear();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});

function renderBridge() {
  render(
    <ListingFocusProvider>
      <ListScrollBridge />
      <div data-testid="map-pin" data-listing-id="listing-123" />
      <div
        data-testid="scroll-container"
        data-search-scroll-container="true"
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

  const card = screen.getByTestId("listing-card") as HTMLElement;

  return { card };
}


describe("ListScrollBridge", () => {
  it("scrolls to the target card via scrollIntoView", async () => {
    renderBridge();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Scroll to listing" })
      );
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });

  it("renders nothing visible (pure side-effect bridge)", () => {
    renderBridge();
    // ListScrollBridge returns null — it renders no DOM of its own
    const bridge = document.querySelector("[data-testid='list-scroll-bridge']");
    expect(bridge).toBeNull();
  });
});
