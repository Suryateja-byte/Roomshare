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

describe("ListingFreshnessCheck", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        id: "listing-123",
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
      }),
    }) as jest.Mock;
  });

  it("renders freshness state from the status snapshot for managed listings", async () => {
    render(<ListingFreshnessCheck listingId="listing-123" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText("Availability freshness")).toBeInTheDocument();
    });

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Reminder due")).toBeInTheDocument();
    expect(screen.getByText("Search eligible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Still available" })).toBeInTheDocument();
  });

  it("shows host recovery controls but not for non-owners", async () => {
    const ownerView = render(
      <ListingFreshnessCheck
        listingId="listing-123"
        canManage={true}
        reviewHref="/listings/listing-123/edit"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Still available" })).toBeInTheDocument();
    });

    ownerView.unmount();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        id: "listing-123",
        version: 12,
        availabilitySource: "HOST_MANAGED",
        status: "PAUSED",
        statusReason: "STALE_AUTO_PAUSE",
        publicStatus: "NEEDS_RECONFIRMATION",
        searchEligible: false,
        freshnessBucket: "AUTO_PAUSE_DUE",
        lastConfirmedAt: "2026-03-01T12:00:00.000Z",
        staleAt: "2026-03-22T12:00:00.000Z",
        autoPauseAt: "2026-03-31T12:00:00.000Z",
      }),
    });

    render(
      <ListingFreshnessCheck listingId="listing-123" />
    );

    await waitFor(() => {
      expect(screen.getByText("Listing Currently Unavailable")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Still available" })
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
