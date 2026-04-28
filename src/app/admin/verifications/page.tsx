import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import VerificationList from "./VerificationList";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Verification Queue | Admin | RoomShare",
  description: "Review and manage user identity verification requests.",
  robots: { index: false, follow: false },
};

export default async function VerificationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/verifications");
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/");
  }

  const requests = await prisma.verificationRequest.findMany({
    select: {
      id: true,
      userId: true,
      documentType: true,
      status: true,
      adminNotes: true,
      createdAt: true,
      updatedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      documentPath: true,
      selfiePath: true,
      documentsExpireAt: true,
      documentsDeletedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: [
      { status: "asc" }, // PENDING first
      { createdAt: "asc" }, // Oldest first
    ],
  });
  const now = new Date();
  const safeRequests = requests.map((request) => ({
    id: request.id,
    userId: request.userId,
    documentType: request.documentType,
    status: request.status,
    adminNotes: request.adminNotes,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy,
    hasDocument:
      Boolean(request.documentPath) &&
      !request.documentsDeletedAt &&
      Boolean(request.documentsExpireAt) &&
      request.documentsExpireAt! > now,
    hasSelfie:
      Boolean(request.selfiePath) &&
      !request.documentsDeletedAt &&
      Boolean(request.documentsExpireAt) &&
      request.documentsExpireAt! > now,
    canApprove:
      Boolean(request.documentPath) &&
      !request.documentsDeletedAt &&
      Boolean(request.documentsExpireAt) &&
      request.documentsExpireAt! > now,
    user: request.user,
  }));

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-on-surface rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                Verification Requests
              </h1>
              <p className="text-on-surface-variant">
                {pendingCount > 0
                  ? `${pendingCount} pending verification${pendingCount > 1 ? "s" : ""}`
                  : "No pending verifications"}
              </p>
            </div>
          </div>
        </div>

        {/* Verification List */}
        <VerificationList initialRequests={safeRequests} />
      </div>
    </div>
  );
}
