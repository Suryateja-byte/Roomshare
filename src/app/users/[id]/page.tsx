import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import UserProfileClient from "./UserProfileClient";
import { getAverageRating } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!user) {
    return { title: "User Not Found" };
  }

  const title = `${user.name || "User"} | RoomShare`;
  const description = `View ${user.name || "User"}'s profile on RoomShare. See listings, reviews, and verification status.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `/users/${id}`,
    },
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const currentUserId = session?.user?.id;

  // Fetch user data and average rating in parallel — both only need `id`
  const [user, avgRating] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      // P0-4 FIX: Use explicit select to prevent PII leaks (email, password, isAdmin, isSuspended)
      select: {
        id: true,
        name: true,
        emailVerified: true,
        image: true,
        bio: true,
        countryOfOrigin: true,
        languages: true,
        isVerified: true,
        createdAt: true,
        listings: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            availableSlots: true,
            images: true,
            status: true,
            createdAt: true,
            location: {
              select: { city: true, state: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        reviewsReceived: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    }),
    getAverageRating(undefined, id),
  ]);

  if (!user) {
    notFound();
  }

  // Check if this is the current user's own profile
  const isOwnProfile = currentUserId === id;

  // Convert Prisma Decimal price fields to plain numbers at the query boundary
  const userWithNumberPrices = {
    ...user,
    listings: user.listings.map((l) => ({ ...l, price: Number(l.price) })),
  };

  return (
    <UserProfileClient
      user={userWithNumberPrices}
      isOwnProfile={isOwnProfile}
      averageRating={avgRating}
      currentUserId={currentUserId}
    />
  );
}
