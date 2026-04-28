import type { ReactElement } from "react";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/data", () => ({
  getAverageRating: jest.fn().mockResolvedValue(null),
}));

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import UserProfilePage from "@/app/users/[id]/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const futureDate = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function createListing(
  overrides: Partial<{
    id: string;
    status: "ACTIVE" | "PAUSED" | "RENTED";
    statusReason: string | null;
    openSlots: number;
    totalSlots: number;
    moveInDate: Date;
    lastConfirmedAt: Date;
  }>
) {
  return {
    id: overrides.id ?? "listing-active",
    title: "Room",
    description: "A room",
    price: 1000,
    availableSlots: 1,
    images: ["https://example.test/room.jpg"],
    status: overrides.status ?? "ACTIVE",
    statusReason: overrides.statusReason ?? null,
    openSlots: overrides.openSlots ?? 1,
    totalSlots: overrides.totalSlots ?? 1,
    moveInDate: overrides.moveInDate ?? futureDate(),
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: overrides.lastConfirmedAt ?? new Date(),
    createdAt: new Date(),
    location: {
      city: "Austin",
      state: "TX",
    },
  };
}

function createUser() {
  return {
    id: "host-1",
    name: "Host",
    emailVerified: new Date(),
    image: null,
    bio: null,
    countryOfOrigin: null,
    languages: [],
    isVerified: true,
    createdAt: new Date(),
    listings: [
      createListing({ id: "listing-active" }),
      createListing({ id: "listing-paused", status: "PAUSED" }),
      createListing({ id: "listing-rented", status: "RENTED" }),
      createListing({
        id: "listing-moderation",
        status: "ACTIVE",
        statusReason: "ADMIN_PAUSED",
      }),
    ],
    reviewsReceived: [],
  };
}

describe("UserProfilePage listing visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(createUser());
  });

  it("hides inactive and moderation-locked listings on public profiles", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "viewer-1" } });

    const element = (await UserProfilePage({
      params: Promise.resolve({ id: "host-1" }),
    })) as ReactElement<{ user: ReturnType<typeof createUser> }>;

    expect(element.props.user.listings.map((listing) => listing.id)).toEqual([
      "listing-active",
    ]);
  });

  it("keeps all listings visible on the owner's own profile", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "host-1" } });

    const element = (await UserProfilePage({
      params: Promise.resolve({ id: "host-1" }),
    })) as ReactElement<{ user: ReturnType<typeof createUser> }>;

    expect(element.props.user.listings.map((listing) => listing.id)).toEqual([
      "listing-active",
      "listing-paused",
      "listing-rented",
      "listing-moderation",
    ]);
  });
});
