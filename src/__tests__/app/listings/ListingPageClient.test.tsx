import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import ListingPageClient from "@/app/listings/[id]/ListingPageClient";

const mockUseSession = jest.fn();
const mockSlotBadge = jest.fn((_: Record<string, unknown>) => (
  <div data-testid="slot-badge" />
));
const mockReviewForm = jest.fn((_: Record<string, unknown>) => (
  <div data-testid="review-form" />
));
const mockRouterReplace = jest.fn();
const mockRouter = {
  replace: mockRouterReplace,
};
let mockSearchParamsString = "";

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
  useRouter: () => mockRouter,
  usePathname: () => "/listings/listing-1",
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
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
  default: (props: Record<string, unknown>) => mockReviewForm(props),
}));

jest.mock("@/components/ReviewList", () => ({
  __esModule: true,
  default: () => <div data-testid="review-list" />,
}));

jest.mock("@/components/ContactHostButton", () => ({
  __esModule: true,
  default: ({
    requiresUnlock,
    disabled,
    disabledLabel,
  }: {
    requiresUnlock?: boolean;
    disabled?: boolean;
    disabledLabel?: string;
    paywallSummary?: { requiresPurchase?: boolean } | null;
  }) => (
    <button data-testid="contact-host" disabled={disabled}>
      {disabled
        ? (disabledLabel ?? "Disabled")
        : requiresUnlock
          ? "Unlock to Contact"
          : "Contact Host"}
    </button>
  ),
}));

jest.mock("@/components/DeleteListingButton", () => ({
  __esModule: true,
  default: () => <button data-testid="delete-listing">Delete</button>,
}));

jest.mock("@/components/ReportButton", () => ({
  __esModule: true,
  default: () => <button data-testid="report-listing">Report</button>,
}));

jest.mock("@/components/PrivateFeedbackDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="private-feedback-dialog">Dialog</div> : null,
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
      version: 1,
      availabilitySource: "LEGACY_BOOKING",
      bookingMode: "REQUEST",
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
    mockReviewForm.mockClear();
    mockRouterReplace.mockReset();
    mockSearchParamsString = "";
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
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      }),
    }) as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
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
    expect(actions).toHaveClass("flex-col");
    expect(actions).toHaveClass("items-end");
    expect(actions).toHaveClass("md:w-auto");

    expect(
      screen.getByRole("heading", {
        name: "Japantown Shared Room with Extra Long Title for Mobile Header Coverage",
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId("share-listing")).toBeInTheDocument();
    expect(screen.getByTestId("save-listing")).toBeInTheDocument();
    expect(screen.getByTestId("report-listing")).toBeInTheDocument();
  });

  it("shows the private feedback link when viewer-state allows it", async () => {
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
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: true,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      }),
    }) as typeof fetch;

    render(<ListingPageClient {...makeProps()} />);

    expect(
      await screen.findByRole("button", {
        name: /not a booking, but want to share feedback/i,
      })
    ).toBeInTheDocument();
  });

  it("passes viewer-state reviewEligibility to ReviewForm without the legacy booking-history prop", async () => {
    render(<ListingPageClient {...makeProps()} />);

    await screen.findByTestId("review-form");

    const lastCall =
      mockReviewForm.mock.calls[mockReviewForm.mock.calls.length - 1]?.[0];
    if (!lastCall) {
      throw new Error("Expected ReviewForm to be called");
    }
    expect(lastCall).toEqual(
      expect.objectContaining({
        listingId: "listing-1",
        isLoggedIn: true,
        hasExistingReview: false,
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      })
    );
    expect(lastCall.hasBookingHistory).toBeUndefined();
  });

  it("feeds SlotBadge from the server snapshot when one is provided", async () => {
    const availability = {
      listingId: "listing-1",
      totalSlots: 2,
      effectiveAvailableSlots: 1,
      heldSlots: 1,
      acceptedSlots: 0,
      rangeVersion: 4,
      asOf: "2026-04-14T18:00:00.000Z",
    };

    render(
      <ListingPageClient
        {...makeProps({
          initialAvailability: availability,
        })}
      />
    );

    await screen.findByTestId("slot-badge");

    const slotBadgeProps = mockSlotBadge.mock.calls[0]?.[0];
    expect(slotBadgeProps).toEqual(
      expect.objectContaining({
        availableSlots: availability.effectiveAvailableSlots,
        totalSlots: availability.totalSlots,
      })
    );
  });

  it("renders the contact-first sidebar for legacy listings", async () => {
    const availability = {
      listingId: "listing-1",
      totalSlots: 2,
      effectiveAvailableSlots: 1,
      heldSlots: 0,
      acceptedSlots: 1,
      rangeVersion: 4,
      asOf: "2026-04-14T18:00:00.000Z",
    };

    render(
      <ListingPageClient
        {...makeProps({
          initialAvailability: availability,
        })}
      />
    );

    await screen.findByTestId("contact-host-sidebar");

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

  it("switches to the viewer-state contact-first contract even when compatibility fields are omitted", async () => {
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
      expect(
        screen.getByText("Contact host to confirm availability")
      ).toBeInTheDocument();
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

  it("renders the owner freshness panel for host-managed listings", async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "owner-1",
          emailVerified: new Date("2026-04-01T12:00:00.000Z"),
        },
      },
      status: "authenticated",
    });

    render(
      <ListingPageClient
        {...makeProps({
          isOwner: true,
          listing: {
            ...makeProps().listing,
            availabilitySource: "HOST_MANAGED",
          },
        })}
      />
    );

    expect(await screen.findAllByTestId("listing-freshness-check")).toHaveLength(
      1
    );
  });

  it("hides nearby places for public viewers under the D1 flag even if coordinates are present", async () => {
    render(
        <ListingPageClient
          {...makeProps({
            coordinates: { lat: 37.77, lng: -122.41 },
            canViewExactLocation: false,
          })}
        />
    );

    expect(screen.queryByTestId("dynamic-component")).not.toBeInTheDocument();
  });

  it("renders an unlock CTA when viewer-state requires purchase", async () => {
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
        canContact: false,
        contactDisabledReason: "PAYWALL_REQUIRED",
        availabilitySource: "LEGACY_BOOKING",
        canBook: false,
        canHold: false,
        bookingDisabledReason: "CONTACT_ONLY",
        paywallSummary: {
          enabled: true,
          mode: "PAYWALL_REQUIRED",
          freeContactsRemaining: 0,
          packContactsRemaining: 0,
          activePassExpiresAt: null,
          requiresPurchase: true,
          offers: [
            {
              productCode: "CONTACT_PACK_3",
              label: "3 contacts",
              priceDisplay: "$4.99",
              description: "Unlock 3 additional message starts.",
            },
          ],
        },
        reviewEligibility: {
          canPublicReview: false,
          hasLegacyAcceptedBooking: false,
          canLeavePrivateFeedback: false,
          reason: "ACCEPTED_BOOKING_REQUIRED",
        },
      }),
    }) as typeof fetch;

    render(<ListingPageClient {...makeProps()} />);

    expect(
      await screen.findAllByRole("button", { name: "Unlock to Contact" })
    ).toHaveLength(2);
  });

  it("shows a cancelled checkout banner and clears only paywall query params", async () => {
    mockSearchParamsString =
      "contactCheckout=cancelled&startDate=2026-05-01&endDate=2026-05-31";

    render(<ListingPageClient {...makeProps()} />);

    expect(
      await screen.findByText("Checkout cancelled. You can unlock contact anytime.")
    ).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/listings/listing-1?startDate=2026-05-01&endDate=2026-05-31",
      { scroll: false }
    );
  });

  it("polls checkout status on success return and refreshes viewer-state after fulfillment", async () => {
    mockSearchParamsString =
      "contactCheckout=success&session_id=cs_test_123&startDate=2026-05-01";

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/payments/checkout-session")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            sessionId: "cs_test_123",
            listingId: "listing-1",
            productCode: "CONTACT_PACK_3",
            checkoutStatus: "COMPLETE",
            paymentStatus: "PAID",
            fulfillmentStatus: "FULFILLED",
            requiresViewerStateRefresh: true,
          }),
        } as unknown as Response;
      }

      if (url.includes("/api/listings/listing-1/viewer-state")) {
        const callCount = (global.fetch as jest.Mock).mock.calls.filter(
          ([requestUrl]) =>
            String(requestUrl).includes("/api/listings/listing-1/viewer-state")
        ).length;

        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () =>
            callCount === 1
              ? {
                  isLoggedIn: true,
                  hasBookingHistory: false,
                  existingReview: null,
                  primaryCta: "CONTACT_HOST",
                  canContact: false,
                  contactDisabledReason: "PAYWALL_REQUIRED",
                  availabilitySource: "LEGACY_BOOKING",
                  canBook: false,
                  canHold: false,
                  bookingDisabledReason: "CONTACT_ONLY",
                  paywallSummary: {
                    enabled: true,
                    mode: "PAYWALL_REQUIRED",
                    freeContactsRemaining: 0,
                    packContactsRemaining: 0,
                    activePassExpiresAt: null,
                    requiresPurchase: true,
                    offers: [],
                  },
                  reviewEligibility: {
                    canPublicReview: false,
                    hasLegacyAcceptedBooking: false,
                    canLeavePrivateFeedback: false,
                    reason: "ACCEPTED_BOOKING_REQUIRED",
                  },
                }
              : {
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
                  paywallSummary: {
                    enabled: true,
                    mode: "METERED",
                    freeContactsRemaining: 0,
                    packContactsRemaining: 3,
                    activePassExpiresAt: null,
                    requiresPurchase: false,
                    offers: [],
                  },
                  reviewEligibility: {
                    canPublicReview: false,
                    hasLegacyAcceptedBooking: false,
                    canLeavePrivateFeedback: false,
                    reason: "ACCEPTED_BOOKING_REQUIRED",
                  },
                },
        } as unknown as Response;
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    }) as typeof fetch;

    render(<ListingPageClient {...makeProps()} />);

    expect(
      await screen.findByText("Contact unlocked. You can message the host now.")
    ).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith(
      "/listings/listing-1?startDate=2026-05-01",
      { scroll: false }
    );
    expect(
      await screen.findAllByRole("button", { name: "Contact Host" })
    ).toHaveLength(2);
  });

  it("shows a pending timeout notice and keeps unlock disabled while fulfillment lags", async () => {
    jest.useFakeTimers();
    mockSearchParamsString =
      "contactCheckout=success&session_id=cs_test_123&startDate=2026-05-01";

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/payments/checkout-session")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            sessionId: "cs_test_123",
            listingId: "listing-1",
            productCode: "CONTACT_PACK_3",
            checkoutStatus: "COMPLETE",
            paymentStatus: "PAID",
            fulfillmentStatus: "PENDING",
            requiresViewerStateRefresh: false,
          }),
        } as unknown as Response;
      }

      if (url.includes("/api/listings/listing-1/viewer-state")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            isLoggedIn: true,
            hasBookingHistory: false,
            existingReview: null,
            primaryCta: "CONTACT_HOST",
            canContact: false,
            contactDisabledReason: "PAYWALL_REQUIRED",
            availabilitySource: "LEGACY_BOOKING",
            canBook: false,
            canHold: false,
            bookingDisabledReason: "CONTACT_ONLY",
            paywallSummary: {
              enabled: true,
              mode: "PAYWALL_REQUIRED",
              freeContactsRemaining: 0,
              packContactsRemaining: 0,
              activePassExpiresAt: null,
              requiresPurchase: true,
              offers: [],
            },
            reviewEligibility: {
              canPublicReview: false,
              hasLegacyAcceptedBooking: false,
              canLeavePrivateFeedback: false,
              reason: "ACCEPTED_BOOKING_REQUIRED",
            },
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    }) as typeof fetch;

    const { unmount } = render(<ListingPageClient {...makeProps()} />);

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(
      screen.getByText(
        "Payment received, still finalizing. Refresh or try again shortly."
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Unlock Pending" })
    ).toHaveLength(2);
    expect(mockRouterReplace).not.toHaveBeenCalled();

    unmount();
    act(() => {
      jest.runOnlyPendingTimers();
      jest.clearAllTimers();
    });
  });
});
