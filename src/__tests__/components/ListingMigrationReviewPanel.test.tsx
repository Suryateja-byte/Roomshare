import type { AnchorHTMLAttributes } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ListingMigrationReviewPanel from "@/components/ListingMigrationReviewPanel";

const mockRouter = {
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
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
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
  reviewListingMigration: jest.fn(),
}));

jest.mock("@/app/actions/admin", () => ({
  reviewListingMigration: jest.fn(),
}));

import { toast } from "sonner";
import { reviewListingMigration as reviewListingMigrationByAdmin } from "@/app/actions/admin";
import { reviewListingMigration as reviewListingMigrationByHost } from "@/app/actions/listing-status";

describe("ListingMigrationReviewPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows blocked review state and disables the action until fixes are resolved", () => {
    render(
      <ListingMigrationReviewPanel
        actor="admin"
        listingId="listing-123"
        expectedVersion={7}
        reviewState={{
          listingId: "listing-123",
          availabilitySource: "LEGACY_BOOKING",
          needsMigrationReview: true,
          status: "ACTIVE",
          statusReason: null,
          cohort: "blocked_legacy_state",
          publicStatus: "AVAILABLE",
          searchEligible: true,
          isReviewRequired: true,
          canReviewNow: false,
          reviewActionLabel: "Convert and keep paused",
          reasonCodes: ["HAS_PENDING_BOOKINGS", "MISSING_MOVE_IN_DATE"],
          reasons: [
            {
              code: "HAS_PENDING_BOOKINGS",
              summary: "Pending booking requests still reference this legacy listing.",
              fixHint: "Resolve pending booking requests before converting this listing.",
              severity: "blocked",
            },
            {
              code: "MISSING_MOVE_IN_DATE",
              summary: "Move-in date is missing.",
              fixHint: "Set a move-in date before reviewing this listing.",
              severity: "fix",
            },
          ],
          blockingReasonCodes: ["HAS_PENDING_BOOKINGS", "MISSING_MOVE_IN_DATE"],
          blockingReasons: [
            {
              code: "HAS_PENDING_BOOKINGS",
              summary: "Pending booking requests still reference this legacy listing.",
              fixHint: "Resolve pending booking requests before converting this listing.",
              severity: "blocked",
            },
            {
              code: "MISSING_MOVE_IN_DATE",
              summary: "Move-in date is missing.",
              fixHint: "Set a move-in date before reviewing this listing.",
              severity: "fix",
            },
          ],
          helperErrorCode: null,
          helperError: null,
        }}
        editHref="/listings/listing-123"
      />
    );

    expect(screen.getByText("Migration review required")).toBeInTheDocument();
    expect(screen.getByText("Blocked legacy state")).toBeInTheDocument();
    expect(screen.getByText("Currently search-eligible")).toBeInTheDocument();
    expect(
      screen.getByText("Pending booking requests still reference this legacy listing.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Convert and keep paused" })
    ).toBeDisabled();
  });

  it("calls the host review action and refreshes after success", async () => {
    (reviewListingMigrationByHost as jest.Mock).mockResolvedValue({
      success: true,
      listingId: "listing-123",
      availabilitySource: "HOST_MANAGED",
      needsMigrationReview: false,
      status: "PAUSED",
      statusReason: "HOST_PAUSED",
      version: 8,
    });

    render(
      <ListingMigrationReviewPanel
        actor="host"
        listingId="listing-123"
        expectedVersion={7}
        reviewState={{
          listingId: "listing-123",
          availabilitySource: "HOST_MANAGED",
          needsMigrationReview: true,
          status: "PAUSED",
          statusReason: "MIGRATION_REVIEW",
          cohort: "manual_review",
          publicStatus: "PAUSED",
          searchEligible: false,
          isReviewRequired: true,
          canReviewNow: true,
          reviewActionLabel: "Mark reviewed",
          reasonCodes: ["ALREADY_HOST_MANAGED", "NEEDS_MIGRATION_REVIEW_FLAG"],
          reasons: [
            {
              code: "ALREADY_HOST_MANAGED",
              summary: "This listing already uses host-managed availability.",
              fixHint: "Review the current availability fields, then mark the listing reviewed when they are correct.",
              severity: "info",
            },
            {
              code: "NEEDS_MIGRATION_REVIEW_FLAG",
              summary: "This listing is flagged for manual migration review.",
              fixHint: "Keep the listing paused until review is completed.",
              severity: "info",
            },
          ],
          blockingReasonCodes: [],
          blockingReasons: [],
          helperErrorCode: null,
          helperError: null,
        }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));

    await waitFor(() => {
      expect(reviewListingMigrationByHost).toHaveBeenCalledWith(
        "listing-123",
        7
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Listing marked reviewed and kept paused."
      );
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
    expect(reviewListingMigrationByAdmin).not.toHaveBeenCalled();
  });

  it("shows host-managed legacy blockers as blocked findings and keeps mark reviewed disabled", () => {
    render(
      <ListingMigrationReviewPanel
        actor="host"
        listingId="listing-123"
        expectedVersion={7}
        reviewState={{
          listingId: "listing-123",
          availabilitySource: "HOST_MANAGED",
          needsMigrationReview: true,
          status: "PAUSED",
          statusReason: "MIGRATION_REVIEW",
          cohort: "manual_review",
          publicStatus: "PAUSED",
          searchEligible: false,
          isReviewRequired: true,
          canReviewNow: false,
          reviewActionLabel: "Mark reviewed",
          reasonCodes: [
            "ALREADY_HOST_MANAGED",
            "HAS_ACCEPTED_BOOKINGS",
            "HAS_FUTURE_INVENTORY_ROWS",
          ],
          reasons: [
            {
              code: "ALREADY_HOST_MANAGED",
              summary: "This listing already uses host-managed availability.",
              fixHint: "Review the current availability fields, then mark the listing reviewed when they are correct.",
              severity: "info",
            },
            {
              code: "HAS_ACCEPTED_BOOKINGS",
              summary: "Accepted legacy bookings still reference this listing.",
              fixHint: "Wait for accepted legacy bookings to end or resolve them before converting.",
              severity: "blocked",
            },
            {
              code: "HAS_FUTURE_INVENTORY_ROWS",
              summary: "Future inventory rows already exist for this listing.",
              fixHint: "Resolve or clear the future inventory rows before marking this listing reviewed.",
              severity: "blocked",
            },
          ],
          blockingReasonCodes: [
            "HAS_ACCEPTED_BOOKINGS",
            "HAS_FUTURE_INVENTORY_ROWS",
          ],
          blockingReasons: [
            {
              code: "HAS_ACCEPTED_BOOKINGS",
              summary: "Accepted legacy bookings still reference this listing.",
              fixHint: "Wait for accepted legacy bookings to end or resolve them before converting.",
              severity: "blocked",
            },
            {
              code: "HAS_FUTURE_INVENTORY_ROWS",
              summary: "Future inventory rows already exist for this listing.",
              fixHint: "Resolve or clear the future inventory rows before marking this listing reviewed.",
              severity: "blocked",
            },
          ],
          helperErrorCode: null,
          helperError: null,
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
    expect(
      screen.getByText("Accepted legacy bookings still reference this listing.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Resolve or clear the future inventory rows before marking this listing reviewed.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Blocked")).toHaveLength(2);
  });
});
