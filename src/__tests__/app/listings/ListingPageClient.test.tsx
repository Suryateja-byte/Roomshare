import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ListingPageClient from "@/app/listings/[id]/ListingPageClient";

const mockUseSession = jest.fn();
const mockUseAvailability = jest.fn();
const mockBookingForm = jest.fn((_: Record<string, unknown>) => (
  <div data-testid="booking-form" />
));
const mockSlotBadge = jest.fn((_: Record<string, unknown>) => (
  <div data-testid="slot-badge" />
));

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

jest.mock("@/components/BookingForm", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockBookingForm(props),
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

jest.mock("@/components/ReportButton", () => ({
  __esModule: true,
  default: () => <button data-testid="report-listing">Report</button>,
}));

jest.mock("@/components/ShareListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="share-listing">Share</button>,
}));

jest.mock("@/components/SaveListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="save-listing">Save</button>,
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
  SlotBadge: (props: Record<string, unknown>) => mockSlotBadge(props),
}));

jest.mock("@/hooks/useAvailability", () => ({
  useAvailability: (...args: unknown[]) => mockUseAvailability(...args),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => <span>{children}</span>,
}));

function makeProps(
  overrides?: Partial<React.ComponentProps<typeof ListingPageClient>>
): React.ComponentProps<typeof ListingPageClient> {
  return {
    listing: {
      id: "listing-1",
      title:
        "Japantown Shared Room with Extra Long Title for Mobile Header Coverage",
      description: "Shared room near Japan Center.",
      price: 850,
      images: ["https://example.com/room.jpg"],
      amenities: ["Wifi", "Kitchen"],
      householdLanguages: ["en"],
      totalSlots: 2,
      availableSlots: 1,
      bookingMode: "REQUEST",
      holdTtlMinutes: 15,
      status: "ACTIVE",
      viewCount: 12,
      genderPreference: null,
      householdGender: null,
      location: {
        city: "San Francisco",
        state: "CA",
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
    bookedDates: [],
    holdEnabled: false,
    coordinates: null,
    similarListings: [],
    viewToken: "view-token-1",
    initialStartDate: undefined,
    initialEndDate: undefined,
    initialAvailability: null,
    ...overrides,
  };
}

describe("ListingPageClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAvailability.mockReturnValue({
      availability: null,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
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
        availabilitySource: "LEGACY_BOOKING",
        canBook: true,
        canHold: false,
        bookingDisabledReason: null,
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      }),
    }) as typeof fetch;
  });

  it("renders a mobile-safe header structure for long visitor titles", async () => {
    render(<ListingPageClient {...makeProps()} />);

    const header = await screen.findByTestId("listing-detail-header");
    const titleGroup = screen.getByTestId("listing-detail-title-group");
    const actions = screen.getByTestId("listing-detail-actions");

    expect(header).toHaveClass("flex-col");
    expect(header).toHaveClass("md:flex-row");
    expect(titleGroup).toHaveClass("min-w-0");
    expect(titleGroup).toHaveClass("flex-1");
    expect(actions).toHaveClass("w-full");
    expect(actions).toHaveClass("justify-end");
    expect(actions).toHaveClass("md:w-auto");
    expect(actions).toHaveClass("md:flex-nowrap");

    expect(
      screen.getByRole("heading", {
        name: "Japantown Shared Room with Extra Long Title for Mobile Header Coverage",
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId("share-listing")).toBeInTheDocument();
    expect(screen.getByTestId("save-listing")).toBeInTheDocument();
    expect(screen.getByTestId("report-listing")).toBeInTheDocument();
  });

  it("feeds SlotBadge and BookingForm from the same live availability snapshot", async () => {
    const refreshAvailability = jest.fn();
    const availability = {
      listingId: "listing-1",
      totalSlots: 2,
      effectiveAvailableSlots: 1,
      heldSlots: 1,
      acceptedSlots: 0,
      rangeVersion: 4,
      asOf: "2026-04-14T18:00:00.000Z",
    };

    mockUseAvailability.mockReturnValue({
      availability,
      isLoading: false,
      error: null,
      refresh: refreshAvailability,
    });

    render(
      <ListingPageClient
        {...makeProps({
          initialStartDate: "2026-05-01",
          initialEndDate: "2026-06-01",
          initialAvailability: availability,
        })}
      />
    );

    await screen.findByTestId("slot-badge");
    await screen.findByTestId("booking-form");

    const slotBadgeProps = mockSlotBadge.mock.calls[0]?.[0];
    expect(slotBadgeProps).toEqual(
      expect.objectContaining({
        availableSlots: availability.effectiveAvailableSlots,
        totalSlots: availability.totalSlots,
      })
    );

    const bookingFormProps = mockBookingForm.mock.calls[0]?.[0];
    expect(bookingFormProps).toEqual(
      expect.objectContaining({
        startDate: "2026-05-01",
        endDate: "2026-06-01",
        availableSlots: availability.effectiveAvailableSlots,
        availability,
        refreshAvailability,
      })
    );
  });

  it("renders contact-first sidebar instead of BookingForm when enabled", async () => {
    const availability = {
      listingId: "listing-1",
      totalSlots: 2,
      effectiveAvailableSlots: 1,
      heldSlots: 0,
      acceptedSlots: 1,
      rangeVersion: 4,
      asOf: "2026-04-14T18:00:00.000Z",
    };

    mockUseAvailability.mockReturnValue({
      availability,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    render(
      <ListingPageClient
        {...makeProps({
          contactFirstEnabled: true,
          initialAvailability: availability,
        })}
      />
    );

    await screen.findByTestId("contact-host-sidebar");

    expect(screen.queryByTestId("booking-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("availability-badge")).toHaveTextContent(
      "1 slot available"
    );
    expect(
      screen.getByText("Contact host to confirm availability")
    ).toBeInTheDocument();
    expect(
      screen.getByText("No booking request or hold is created from this page.")
    ).toBeInTheDocument();
  });

  it("switches to the viewer-state contact-first contract even when the prop fallback is false", async () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: async () => ({
        isLoggedIn: false,
        hasBookingHistory: false,
        existingReview: null,
        primaryCta: "LOGIN_TO_MESSAGE",
        canContact: false,
        availabilitySource: "HOST_MANAGED",
        canBook: false,
        canHold: false,
        bookingDisabledReason: "CONTACT_ONLY",
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "LOGIN_REQUIRED",
        },
      }),
    }) as typeof fetch;

    render(<ListingPageClient {...makeProps({ isLoggedIn: false })} />);

    await waitFor(() => {
      expect(screen.queryByTestId("booking-form")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("contact-host-sidebar")).toBeInTheDocument();
    const loginLinks = screen.getAllByRole("link", {
      name: "Sign in to contact host",
    });

    expect(loginLinks).toHaveLength(2);
    expect(loginLinks[0]).toHaveAttribute("href", "/login");
    expect(screen.getByTestId("availability-badge")).toHaveTextContent(
      "1 slot available"
    );
  });
});
