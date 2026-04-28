import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "My Profile | RoomShare",
  description: "View and manage your RoomShare profile.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    redirect("/login");
  }

  // Fetch only fields that are safe to serialize to the client.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
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
          location: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  // Convert Prisma Decimal price fields to plain numbers at the query boundary
  const userWithNumberPrices = {
    ...user,
    listings: user.listings.map((l) => ({ ...l, price: Number(l.price) })),
  };

  return <ProfileClient user={userWithNumberPrices} />;
}
