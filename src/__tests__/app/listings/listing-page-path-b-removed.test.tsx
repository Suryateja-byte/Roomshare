import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import ListingPageClient from "@/app/listings/[id]/ListingPageClient";

const mockUseSession = jest.fn();

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
  SlotBadge: () => <div data-testid="slot-badge" />,
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

function makeProps(
  overrides?: Partial<React.ComponentProps<typeof ListingPageClient>>
): React.ComponentProps<typeof ListingPageClient> {
  return {
    listing: {
      id: "listing-legacy-1",
      title: "Legacy booking listing",
      description: "Legacy booking listing description.",
      price: 1500,
      images: ["https://example.com/room.jpg"],
      amenities: ["Wifi"],
      householdLanguages: ["en"],
      totalSlots: 2,
      availableSlots: 1,
      version: 3,
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
        bio: null,
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
    holdEnabled: true,
    coordinates: null,
    similarListings: [],
    viewToken: "view-token-1",
    initialAvailability: {
      listingId: "listing-legacy-1",
      totalSlots: 2,
      effectiveAvailableSlots: 1,
      heldSlots: 0,
      acceptedSlots: 1,
      rangeVersion: 2,
      asOf: "2026-04-14T18:00:00.000Z",
    },
    ...overrides,
  };
}

function listSourceFiles(rootDir: string): string[] {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        return [];
      }

      return listSourceFiles(entryPath);
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      return [];
    }

    return [entryPath];
  });
}

describe("listing detail public CTA cleanup", () => {
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
        availabilitySource: "LEGACY_BOOKING",
        canBook: true,
        canHold: true,
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

  it.each([false, true])(
    "never renders the booking CTA copy for legacy availability when the flag is %s",
    (contactFirstEnabled) => {
      render(
        <ListingPageClient
          {...makeProps({
            contactFirstEnabled,
          })}
        />
      );

      expect(() => screen.getByText(/request to book/i)).toThrow();
      expect(() => screen.getByText("Place Hold")).toThrow();
      expect(
        screen.getByText("Contact host to confirm availability")
      ).toBeInTheDocument();
    }
  );

  it("keeps the removed polling hook name out of the source tree", () => {
    const removedHookName = ["use", "Availability"].join("");
    const sourceRoot = path.join(process.cwd(), "src");
    const sourceFiles = listSourceFiles(sourceRoot);

    for (const filePath of sourceFiles) {
      const fileContents = fs.readFileSync(filePath, "utf8");
      expect(fileContents.includes(removedHookName)).toBe(false);
    }
  });
});
