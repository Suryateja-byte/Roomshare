import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingStatusToggle from "@/components/ListingStatusToggle";
import { updateListingStatus } from "@/app/actions/listing-status";
import { toast } from "sonner";

const mockRouter = {
  refresh: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/app/actions/listing-status", () => ({
  updateListingStatus: jest.fn(),
}));

describe("ListingStatusToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("threads the returned version into later status changes", async () => {
    (updateListingStatus as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        status: "PAUSED",
        version: 8,
      })
      .mockResolvedValueOnce({
        success: true,
        status: "RENTED",
        version: 9,
      });

    render(
      <ListingStatusToggle
        listingId="listing-123"
        currentStatus="ACTIVE"
        currentVersion={7}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Active/i }));
    await userEvent.click(screen.getByRole("button", { name: /Paused/i }));

    await waitFor(() => {
      expect(updateListingStatus).toHaveBeenNthCalledWith(
        1,
        "listing-123",
        "PAUSED",
        7
      );
    });

    await userEvent.click(screen.getByRole("button", { name: /Paused/i }));
    await userEvent.click(screen.getByRole("button", { name: /Rented/i }));

    await waitFor(() => {
      expect(updateListingStatus).toHaveBeenNthCalledWith(
        2,
        "listing-123",
        "RENTED",
        8
      );
    });
  });

  it("rehydrates refreshed props after a version conflict", async () => {
    (updateListingStatus as jest.Mock)
      .mockResolvedValueOnce({
        error: "This listing was updated elsewhere. Reload and try again.",
        code: "VERSION_CONFLICT",
      })
      .mockResolvedValueOnce({
        success: true,
        status: "RENTED",
        version: 9,
      });

    const { rerender } = render(
      <ListingStatusToggle
        listingId="listing-123"
        currentStatus="ACTIVE"
        currentVersion={7}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Active/i }));
    await userEvent.click(screen.getByRole("button", { name: /Paused/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Listing changed elsewhere. Refreshing the latest version..."
      );
      expect(mockRouter.refresh).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /Active/i })).toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /Active/i }));
    expect(updateListingStatus).toHaveBeenCalledTimes(1);

    rerender(
      <ListingStatusToggle
        listingId="listing-123"
        currentStatus="PAUSED"
        currentVersion={8}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Paused/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /Paused/i }));
    await userEvent.click(screen.getByRole("button", { name: /Rented/i }));

    await waitFor(() => {
      expect(updateListingStatus).toHaveBeenNthCalledWith(
        2,
        "listing-123",
        "RENTED",
        8
      );
    });
  });
});
