import React from "react";
import "@testing-library/jest-dom";
import { act, render } from "@testing-library/react";
import ListingPageClient from "@/app/listings/[id]/ListingPageClient";
import { PUBLIC_CACHE_INVALIDATED_EVENT } from "@/lib/public-cache/client";

const mockUseSession = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const MockDynamicComponent = () => <div data-testid="dynamic-component" />;
    MockDynamicComponent.displayName = "MockDynamicComponent";
    return MockDynamicComponent;
  },
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

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
  usePathname: () => "/listings/listing-1",
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("@/components/listings/ListingCard", () => ({
  __esModule: true,
  default: () => <div data-testid="listing-card" />,
}));

jest.mock("@/components/ImageGallery", () => ({
  __esModule: true,
  default: () => <div data-testid="image-gallery" />,
}));

jest.mock("@/components/ReviewForm", () => ({
  __esModule: true,
  default: () => <div data-testid="review-form" />,
}));

jest.mock("@/components/ReviewList", () => ({
  __esModule: true,
  default: () => <div data-testid="review-list" />,
}));

jest.mock("@/components/ContactHostButton", () => ({
  __esModule: true,
  default: () => <button data-testid="contact-host">Contact Host</button>,
}));

jest.mock("@/components/DeleteListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="delete-listing">Delete</button>,
}));

jest.mock("@/components/PrivateFeedbackDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="private-feedback-dialog">Dialog</div> : null,
}));

jest.mock("@/components/ReportButton", () => ({
  __esModule: true,
  default: () => <button data-testid="report-button">Report</button>,
}));

jest.mock("@/components/ShareListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="share-button">Share</button>,
}));

jest.mock("@/components/SaveListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="save-button">Save</button>,
}));

jest.mock("@/components/ListingStatusToggle", () => ({
  __esModule: true,
  default: () => <div data-testid="listing-status-toggle" />,
}));

jest.mock("@/components/ListingFreshnessCheck", () => ({
  __esModule: true,
  default: () => <div data-testid="listing-freshness-check" />,
}));

jest.mock("@/components/UserAvatar", () => ({
  __esModule: true,
  default: () => <div data-testid="user-avatar" />,
}));

jest.mock("@/components/listings/RoomPlaceholder", () => ({
  __esModule: true,
  default: () => <div data-testid="room-placeholder" />,
}));

jest.mock("@/components/listings/SlotBadge", () => ({
  SlotBadge: () => <div data-testid="slot-badge" />,
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock("@/app/listings/[id]/ListingViewTracker", () => ({
  __esModule: true,
  default: () => null,
}));

function makeProps(
  overrides?: Partial<React.ComponentProps<typeof ListingPageClient>>
): React.ComponentProps<typeof ListingPageClient> {
  return {
    listing: {
      id: "listing-1",
      title: "Shared room in Austin",
      description: "Nice place",
      price: 850,
      images: ["https://example.com/room.jpg"],
      amenities: ["Wifi", "Kitchen"],
      householdLanguages: ["en"],
      totalSlots: 2,
      availableSlots: 1,
      version: 1,
      availabilitySource: "LEGACY_BOOKING",
      bookingMode: "REQUEST",
      status: "ACTIVE",
      viewCount: 12,
      genderPreference: null,
      householdGender: null,
      location: {
        city: "Austin",
        state: "TX",
      },
      owner: {
        id: "owner-1",
        name: "Host",
        image: null,
        bio: "Host bio",
        isVerified: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      ownerId: "owner-1",
    },
    reviews: [],
    isOwner: false,
    isLoggedIn: true,
    userHasBooking: false,
    userExistingReview: null,
    holdEnabled: false,
    coordinates: null,
    similarListings: [],
    viewToken: "view-token-1",
    initialAvailability: null,
    ...overrides,
  };
}

describe("ListingPageClient public cache invalidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "viewer-1",
          emailVerified: new Date("2026-04-01T12:00:00.000Z"),
        },
      },
      status: "authenticated",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        isLoggedIn: true,
        hasBookingHistory: false,
        existingReview: null,
        primaryCta: "CONTACT_HOST",
        canContact: true,
        contactDisabledReason: null,
        availabilitySource: "LEGACY_BOOKING",
        canBook: false,
        canHold: false,
        bookingDisabledReason: "CONTACT_ONLY",
        paywallSummary: null,
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      }),
    }) as typeof fetch;
  });

  it("refreshes guest detail pages when public cache is invalidated", async () => {
    render(<ListingPageClient {...makeProps()} />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PUBLIC_CACHE_INVALIDATED_EVENT, {
          detail: { cacheFloorToken: "token-2" },
        })
      );
    });

    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not auto-refresh owner views", async () => {
    render(
      <ListingPageClient
        {...makeProps({
          isOwner: true,
          isLoggedIn: true,
        })}
      />
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(PUBLIC_CACHE_INVALIDATED_EVENT, {
          detail: { cacheFloorToken: "token-2" },
        })
      );
    });

    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
