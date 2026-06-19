import { render, waitFor } from "@testing-library/react";
import { SearchUrlCanonicalizer } from "@/components/search/SearchUrlCanonicalizer";

const mockPathname = jest.fn();
const mockSearchParams = jest.fn();
const mockEmitSearchClientMetric = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

jest.mock("@/lib/search/search-telemetry-client", () => ({
  emitSearchClientMetric: (payload: unknown) =>
    mockEmitSearchClientMetric(payload),
}));

describe("SearchUrlCanonicalizer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue("/search");
  });

  it("rewrites legacy URLs with history.replaceState and skips router.replace", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(
      new URLSearchParams(`startDate=2027-02-01&minBudget=500`)
    );

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        "",
        "/search?minPrice=500&moveInDate=2027-02-01"
      );
    });

    expect(mockEmitSearchClientMetric).toHaveBeenCalledWith({
      metric: "cfm.search.legacy_url_count",
      alias: "startDate",
      surface: "spa",
    });
    expect(mockEmitSearchClientMetric).toHaveBeenCalledWith({
      metric: "cfm.search.legacy_url_count",
      alias: "minBudget",
      surface: "spa",
    });
  });

  it("does nothing for canonical URLs", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(
      new URLSearchParams("minPrice=500&moveInDate=2027-02-01")
    );

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    expect(mockEmitSearchClientMetric).not.toHaveBeenCalled();
  });

  // #24 regression: cursor/page must be stripped from the canonical shareable URL.
  // "Load more" state is ephemeral — it must never survive a copy/bookmark cycle.
  it("strips cursor from the canonical URL (#24)", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(
      new URLSearchParams("q=austin&cursor=abc123")
    );

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    });

    const [, , calledUrl] = replaceStateSpy.mock.calls[0];
    expect(calledUrl).not.toContain("cursor=");
    expect(calledUrl).not.toContain("cursorStack=");
  });

  it("strips page token from the canonical URL (#24)", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(
      new URLSearchParams("q=austin&page=3")
    );

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    });

    const [, , calledUrl] = replaceStateSpy.mock.calls[0];
    expect(calledUrl).not.toContain("page=");
    expect(calledUrl).not.toContain("pageNumber=");
  });

  it("strips legacy cursorStack alias from the canonical URL (#24)", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(
      new URLSearchParams("q=austin&cursorStack=abc123")
    );

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    });

    const [, , calledUrl] = replaceStateSpy.mock.calls[0];
    expect(calledUrl).not.toContain("cursor=");
    expect(calledUrl).not.toContain("cursorStack=");
  });

  it("counts and rewrites legacy where URLs", async () => {
    const replaceStateSpy = jest
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    mockSearchParams.mockReturnValue(new URLSearchParams("where=Austin"));

    render(<SearchUrlCanonicalizer />);

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        "",
        "/search?locationLabel=Austin"
      );
    });

    expect(mockEmitSearchClientMetric).toHaveBeenCalledWith({
      metric: "cfm.search.legacy_url_count",
      alias: "where",
      surface: "spa",
    });
  });
});
