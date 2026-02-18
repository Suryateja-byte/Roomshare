import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import ZeroResultsSuggestions from "@/components/ZeroResultsSuggestions";
import type { FilterSuggestion } from "@/lib/data";

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children: ReactNode;
  }) => <button {...props}>{children}</button>,
}));

describe("ZeroResultsSuggestions", () => {
  const locationSuggestion: FilterSuggestion[] = [
    {
      filter: "location",
      label: "search area",
      resultsWithout: 24,
      suggestion: "Expand your search area to see 24 listings",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("expands explicit bounds and preserves query for location suggestion", () => {
    mockSearchParams = new URLSearchParams(
      "q=Austin&minLat=37&maxLat=38&minLng=-123&maxLng=-122&page=2&cursor=abc&cursorStack=foo&pageNumber=2"
    );

    render(<ZeroResultsSuggestions suggestions={locationSuggestion} query="Austin" />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Expand your search area to see 24 listings/i,
      })
    );

    expect(mockPush).toHaveBeenCalledTimes(1);
    const nextUrl = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(nextUrl.split("?")[1] ?? "");

    expect(params.get("q")).toBe("Austin");
    expect(params.get("page")).toBeNull();
    expect(params.get("cursor")).toBeNull();
    expect(params.get("cursorStack")).toBeNull();
    expect(params.get("pageNumber")).toBeNull();

    const minLat = parseFloat(params.get("minLat") ?? "");
    const maxLat = parseFloat(params.get("maxLat") ?? "");
    const minLng = parseFloat(params.get("minLng") ?? "");
    const maxLng = parseFloat(params.get("maxLng") ?? "");

    expect(Number.isFinite(minLat)).toBe(true);
    expect(Number.isFinite(maxLat)).toBe(true);
    expect(Number.isFinite(minLng)).toBe(true);
    expect(Number.isFinite(maxLng)).toBe(true);
    expect(maxLat - minLat).toBeGreaterThan(1);
  });

  it("supports antimeridian bounds when expanding location suggestion", () => {
    mockSearchParams = new URLSearchParams(
      "q=Fiji&minLat=-20&maxLat=-10&minLng=170&maxLng=-170"
    );

    render(<ZeroResultsSuggestions suggestions={locationSuggestion} query="Fiji" />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Expand your search area to see 24 listings/i,
      })
    );

    const nextUrl = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(nextUrl.split("?")[1] ?? "");

    expect(params.get("q")).toBe("Fiji");
    const minLng = parseFloat(params.get("minLng") ?? "");
    const maxLng = parseFloat(params.get("maxLng") ?? "");
    expect(Number.isFinite(minLng)).toBe(true);
    expect(Number.isFinite(maxLng)).toBe(true);
    const lngSpan =
      minLng > maxLng ? 180 - minLng + (maxLng + 180) : maxLng - minLng;
    expect(lngSpan).toBeGreaterThan(20);
  });

  it("drops query as fallback when location suggestion has no coordinates", () => {
    mockSearchParams = new URLSearchParams("q=Nowhere&page=3");

    render(<ZeroResultsSuggestions suggestions={locationSuggestion} query="Nowhere" />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Expand your search area to see 24 listings/i,
      })
    );

    const nextUrl = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(nextUrl.split("?")[1] ?? "");

    expect(params.get("q")).toBeNull();
    expect(params.get("page")).toBeNull();
    expect(params.get("cursor")).toBeNull();
    expect(params.get("cursorStack")).toBeNull();
    expect(params.get("pageNumber")).toBeNull();
  });
});
