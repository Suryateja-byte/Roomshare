import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CreateListingForm from "./CreateListingForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import ProfileWarningBanner from "./ProfileWarningBanner";
import { features } from "@/lib/env";

export const metadata: Metadata = {
  title: "Create Listing | RoomShare",
  description: "List your room or shared space on RoomShare and find the perfect roommate.",
  robots: { index: false, follow: false },
};

export default async function CreateListingPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  // Check profile completion (soft warning, not blocking)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      bio: true,
      image: true,
      countryOfOrigin: true,
      languages: true,
      isVerified: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const profileCompletion = calculateProfileCompletion(user);

  return (
    <div className="min-h-screen bg-surface-canvas font-sans selection:bg-on-surface selection:text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 mb-8 sm:mb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-6 sm:mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to home
        </Link>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold font-display text-on-surface tracking-tight mb-4 leading-tight">
          List your sanctuary.
        </h1>
        <p className="text-base sm:text-lg text-on-surface-variant font-light max-w-xl leading-relaxed">
          Share your space with someone who fits your lifestyle. Tell us about
          your place, your vibe, and what you&apos;re looking for.
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        {/* Soft warning banner if profile is less than 60% complete */}
        {profileCompletion.percentage < 60 && (
          <ProfileWarningBanner
            percentage={profileCompletion.percentage}
            missing={profileCompletion.missing}
          />
        )}

        <div className="bg-surface-container-lowest rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 md:p-12 shadow-ambient border border-outline-variant/20">
          <CreateListingForm enableWholeUnitMode={features.wholeUnitMode} />
        </div>
      </div>
    </div>
  );
}
