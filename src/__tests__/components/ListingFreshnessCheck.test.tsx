import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingFreshnessCheck from "@/components/ListingFreshnessCheck";
import { recoverHostManagedListing } from "@/app/actions/listing-status";

const mockRouter = {
  push: jest.fn(),
  refresh: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
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

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/app/actions/listing-status", () => ({
  recoverHostManagedListing: jest.fn(),
}));

function buildManagedSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-123",
    canManage: true,
    version: 12,
    availabilitySource: "HOST_MANAGED",
    status: "ACTIVE",
    statusReason: null,
    publicStatus: "AVAILABLE",
    searchEligible: true,
    freshnessBucket: "REMINDER",
    lastConfirmedAt: "2026-04-01T12:00:00.000Z",
    staleAt: "2026-04-22T12:00:00.000Z",
    autoPauseAt: "2026-05-01T12:00:00.000Z",
    contactDisabledReason: null,
    ...overrides,
  };
}

function buildPublicSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-123",
    canManage: false,
    availabilitySource: "HOST_MANAGED",
    publicStatus: "PAUSED",
    searchEligible: false,
    contactDisabledReason: "LISTING_UNAVAILABLE",
    ...overrides,
  };
}

describe("ListingFreshnessCheck", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => buildManagedSnapshot(),
    }) as jest.Mock;
  });

  it("renders freshness diagnostics from the managed snapshot", async () => {
    render(<ListingFreshnessCheck listingId="listing-123" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText("Availability freshness")).toBeInTheDocument();
    });

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Reminder due")).toBeInTheDocument();
    expect(screen.getByText("Search eligible")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Still available" })
    ).toBeInTheDocument();
  });

  it("shows the generic public unavailable overlay without diagnostics for guests", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () =>
        buildPublicSnapshot({
          contactDisabledReason: "MODERATION_LOCKED",
        }),
    });

    render(<ListingFreshnessCheck listingId="listing-123" />);

    await waitFor(() => {
      expect(
        screen.getByText("Listing Currently Unavailable")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("This listing is temporarily unavailable right now.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Availability freshness")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Still available" })
    ).not.toBeInTheDocument();
  });

  it("downgrades safely when the prop says manage but the server says public", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () =>
        buildPublicSnapshot({
          contactDisabledReason: "MIGRATION_REVIEW",
        }),
    });

    render(<ListingFreshnessCheck listingId="listing-123" canManage={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("Listing Currently Unavailable")
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText("Availability freshness")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review and reopen" })
    ).not.toBeInTheDocument();
  });

  it("uses the latest expectedVersion for reconfirm actions", async () => {
    (recoverHostManagedListing as jest.Mock).mockResolvedValue({
      success: true,
      status: "ACTIVE",
      statusReason: null,
      version: 13,
    });

    render(<ListingFreshnessCheck listingId="listing-123" canManage={true} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Still available" })
    );

    await waitFor(() => {
      expect(recoverHostManagedListing).toHaveBeenCalledWith(
        "listing-123",
        12,
        "RECONFIRM"
      );
    });
  });
});
