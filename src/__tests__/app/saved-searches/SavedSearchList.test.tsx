import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import SavedSearchList from "@/app/saved-searches/SavedSearchList";

const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();
const mockRouterPush = jest.fn();
const mockRouter = {
  replace: mockRouterReplace,
  refresh: mockRouterRefresh,
  push: mockRouterPush,
};
let mockSearchParamsString = "";

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/saved-searches",
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/app/actions/saved-search", () => ({
  deleteSavedSearch: jest.fn(),
  toggleSearchAlert: jest.fn(),
}));

jest.mock("@/lib/client-redirect", () => ({
  redirectToUrl: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("SavedSearchList", () => {
  const baseSearch = {
    id: "search-123",
    name: "Downtown rooms",
    query: "downtown",
    filters: { query: "downtown" },
    alertEnabled: true,
    effectiveAlertState: "LOCKED" as const,
    lastAlertAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
  };

  const lockedPaywallSummary = {
    enabled: true,
    mode: "PAYWALL_REQUIRED" as const,
    activePassExpiresAt: null,
    requiresPurchase: true,
    offers: [
      {
        productCode: "MOVERS_PASS_30D" as const,
        label: "30-day pass",
        priceDisplay: "$9.99",
        description: "Unlimited message starts for 30 days.",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsString = "";
    global.fetch = jest.fn();
  });

  it("renders locked search state with a pass-only unlock CTA", () => {
    render(
      <SavedSearchList
        initialSearches={[baseSearch]}
        initialAlertPaywallSummary={lockedPaywallSummary}
      />
    );

    expect(screen.getByText("Alerts locked")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unlock alerts · $9.99" })
    ).toBeInTheDocument();
  });

  it("shows a cancelled checkout notice and clears only paywall params", async () => {
    mockSearchParamsString = "alertsCheckout=cancelled&page=2";

    render(
      <SavedSearchList
        initialSearches={[baseSearch]}
        initialAlertPaywallSummary={lockedPaywallSummary}
      />
    );

    expect(
      await screen.findByText("Checkout cancelled. You can unlock alerts anytime.")
    ).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith("/saved-searches?page=2", {
      scroll: false,
    });
  });

  it("polls alert checkout return and refreshes when fulfillment completes", async () => {
    mockSearchParamsString = "alertsCheckout=success&session_id=cs_test_123";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: "cs_test_123",
        purchaseContext: "SEARCH_ALERTS",
        listingId: null,
        productCode: "MOVERS_PASS_30D",
        checkoutStatus: "COMPLETE",
        paymentStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        requiresViewerStateRefresh: false,
      }),
    });

    render(
      <SavedSearchList
        initialSearches={[baseSearch]}
        initialAlertPaywallSummary={lockedPaywallSummary}
      />
    );

    expect(await screen.findByText("Alerts unlocked.")).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith("/saved-searches", {
      scroll: false,
    });
    expect(mockRouterRefresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Alerts active")).toBeInTheDocument();
    });
  });
});
