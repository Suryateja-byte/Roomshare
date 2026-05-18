import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LowResultsGuidance } from "@/components/LowResultsGuidance";

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

describe("LowResultsGuidance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders guidance and near-match action for one to four results", () => {
    render(
      <LowResultsGuidance
        resultCount={3}
        filterParams={{ maxPrice: 900, amenities: ["Wifi"] }}
        nearMatchesEnabled={false}
        nearMatchCount={7}
      />
    );

    expect(screen.getByText("Only 3 listings found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Include near matches/i })
    ).toBeInTheDocument();
    expect(screen.getByText("+7")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Increase max price \(\$900\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Fewer amenities \(1 selected\)/i })
    ).toBeInTheDocument();
  });

  it("hides when result count is zero, high, or near matches are already enabled", () => {
    const { rerender } = render(
      <LowResultsGuidance
        resultCount={0}
        filterParams={{ maxPrice: 900 }}
        nearMatchesEnabled={false}
      />
    );
    expect(screen.queryByText(/Only .* listings? found/i)).toBeNull();

    rerender(
      <LowResultsGuidance
        resultCount={5}
        filterParams={{ maxPrice: 900 }}
        nearMatchesEnabled={false}
      />
    );
    expect(screen.queryByText(/Only .* listings? found/i)).toBeNull();

    rerender(
      <LowResultsGuidance
        resultCount={3}
        filterParams={{ maxPrice: 900 }}
        nearMatchesEnabled
      />
    );
    expect(screen.queryByText(/Only .* listings? found/i)).toBeNull();
  });

  it("pushes nearMatches=1 and clears pagination params", async () => {
    mockSearchParams = new URLSearchParams(
      "maxPrice=900&page=3&cursor=abc&cursorStack=old&pageNumber=2"
    );

    render(
      <LowResultsGuidance
        resultCount={2}
        filterParams={{ maxPrice: 900 }}
        nearMatchesEnabled={false}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Include near matches/i })
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = new URL(mockPush.mock.calls[0][0], "http://localhost");
    expect(pushedUrl.pathname).toBe("/search");
    expect(pushedUrl.searchParams.get("maxPrice")).toBe("900");
    expect(pushedUrl.searchParams.get("nearMatches")).toBe("1");
    expect(pushedUrl.searchParams.has("page")).toBe(false);
    expect(pushedUrl.searchParams.has("cursor")).toBe(false);
    expect(pushedUrl.searchParams.has("cursorStack")).toBe(false);
    expect(pushedUrl.searchParams.has("pageNumber")).toBe(false);
  });

  it("suggestion clicks remove the selected filter and clear pagination params", async () => {
    mockSearchParams = new URLSearchParams(
      "minPrice=500&maxPrice=900&amenities=Wifi&page=2&cursor=abc"
    );

    render(
      <LowResultsGuidance
        resultCount={2}
        filterParams={{ minPrice: 500, maxPrice: 900, amenities: ["Wifi"] }}
        nearMatchesEnabled={false}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Expand price range \(\$500 - \$900\)/i,
      })
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pushedUrl = new URL(mockPush.mock.calls[0][0], "http://localhost");
    expect(pushedUrl.pathname).toBe("/search");
    expect(pushedUrl.searchParams.has("minPrice")).toBe(false);
    expect(pushedUrl.searchParams.has("maxPrice")).toBe(false);
    expect(pushedUrl.searchParams.get("amenities")).toBe("Wifi");
    expect(pushedUrl.searchParams.has("page")).toBe(false);
    expect(pushedUrl.searchParams.has("cursor")).toBe(false);
  });
});
