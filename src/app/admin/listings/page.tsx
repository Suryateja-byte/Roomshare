import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ListingStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import ListingList from "./ListingList";

export const metadata = {
  title: "Listing Moderation | Admin | RoomShare",
  description: "Moderate listings on the RoomShare platform",
};

const PAGE_SIZE = 50;
const LISTING_STATUSES = ["all", "ACTIVE", "PAUSED", "RENTED"] as const;
type ListingStatusFilter = (typeof LISTING_STATUSES)[number];

type AdminListingsPageProps = {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseStatus(value: string | undefined): ListingStatusFilter {
  return LISTING_STATUSES.includes(value as ListingStatusFilter)
    ? (value as ListingStatusFilter)
    : "all";
}

export default async function AdminListingsPage({
  searchParams,
}: AdminListingsPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/listings");
  }

  // Check if user is admin
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!currentUser?.isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const searchQuery = (params.q || "").trim().slice(0, 100);
  const currentStatus = parseStatus(params.status);
  const requestedPage = parsePage(params.page);
  const where: Prisma.ListingWhereInput = {};

  if (searchQuery) {
    where.OR = [
      { title: { contains: searchQuery, mode: "insensitive" } },
      { description: { contains: searchQuery, mode: "insensitive" } },
      {
        owner: { is: { name: { contains: searchQuery, mode: "insensitive" } } },
      },
      {
        owner: {
          is: { email: { contains: searchQuery, mode: "insensitive" } },
        },
      },
    ];
  }

  if (currentStatus !== "all") {
    where.status = currentStatus as ListingStatus;
  }

  const totalListings = await prisma.listing.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalListings / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const listings = await prisma.listing.findMany({
    where,
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      statusReason: true,
      version: true,
      images: true,
      viewCount: true,
      createdAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      location: {
        select: {
          city: true,
          state: true,
        },
      },
      _count: {
        select: {
          reports: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Home className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                Listing Moderation
              </h1>
              <p className="text-on-surface-variant">
                Review and manage all listings
              </p>
            </div>
          </div>
        </div>

        {/* Listing List */}
        <ListingList
          initialListings={listings.map((l) => ({
            ...l,
            price: Number(l.price),
          }))}
          totalListings={totalListings}
          searchQuery={searchQuery}
          currentStatus={currentStatus}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
