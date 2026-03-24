import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import EditListingForm from "./EditListingForm";
import { features } from "@/lib/env";

export const metadata: Metadata = {
  title: "Edit Listing | RoomShare",
  description: "Update your listing details, photos, and availability on RoomShare.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { location: true },
  });

  if (!listing) {
    notFound();
  }

  // Check if user is the owner
  if (listing.ownerId !== session.user.id) {
    redirect(`/listings/${id}`);
  }

  return (
    <div className="min-h-screen bg-surface-canvas py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Edit Listing</h1>
          <p className="text-muted-foreground mt-2">
            Update your listing details
          </p>
        </div>
        <EditListingForm
          listing={{
            ...listing,
            price: Number(listing.price),
            updatedAt: listing.updatedAt.toISOString(),
          }}
          enableWholeUnitMode={features.wholeUnitMode}
        />
      </div>
    </div>
  );
}
