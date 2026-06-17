import { render, screen } from "@testing-library/react";
import { ExpandSearchSuggestions } from "@/components/search/ExpandSearchSuggestions";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("ExpandSearchSuggestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ count: 50 }) }) as jest.Mock;
  });

  // Regression (M-07): the component is not always remounted on a param change
  // (client-side search), so it must clear stale suggestions when searchParamsString
  // changes — otherwise the old "+N rooms" buttons relax the PREVIOUS query.
  it("clears stale suggestion buttons when the search params change", async () => {
    const { rerender } = render(
      <ExpandSearchSuggestions
        currentCount={2}
        searchParamsString="maxPrice=1000"
      />
    );

    // Wait for the debounce + count fetch to populate a suggestion button.
    const button = await screen.findByRole("button");
    expect(button).toHaveTextContent(/within \$200 of your budget/i);

    // Changing the params must immediately clear the stale buttons (back to the
    // loading skeleton), not leave the prior query's buttons clickable.
    rerender(
      <ExpandSearchSuggestions
        currentCount={2}
        searchParamsString="maxPrice=9000"
      />
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
