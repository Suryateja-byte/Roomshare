import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import UserList from "./UserList";

export const metadata = {
  title: "User Management | Admin | RoomShare",
  description: "Manage users on the RoomShare platform",
};

export default async function AdminUsersPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/users");
  }

  // Check if user is admin
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!currentUser?.isAdmin) {
    redirect("/");
  }

  // Fetch all users
  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isVerified: true,
        isAdmin: true,
        isSuspended: true,
        emailVerified: true,
        _count: {
          select: {
            listings: true,
            reviewsWritten: true,
          },
        },
      },
      orderBy: { email: "asc" },
      take: 100, // Limit for initial load
    }),
    prisma.user.count(),
  ]);

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
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                User Management
              </h1>
              <p className="text-on-surface-variant">
                Manage user accounts and permissions
              </p>
            </div>
          </div>
        </div>

        {/* User List */}
        <UserList
          initialUsers={users}
          totalUsers={totalUsers}
          currentUserId={session.user.id}
        />
      </div>
    </div>
  );
}
