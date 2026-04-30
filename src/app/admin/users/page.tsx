import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import UserList from "./UserList";

export const metadata = {
  title: "User Management | Admin | RoomShare",
  description: "Manage users on the RoomShare platform",
};

const PAGE_SIZE = 50;
const USER_FILTERS = ["all", "verified", "admin", "suspended"] as const;
type UserFilter = (typeof USER_FILTERS)[number];

type AdminUsersPageProps = {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseFilter(value: string | undefined): UserFilter {
  return USER_FILTERS.includes(value as UserFilter)
    ? (value as UserFilter)
    : "all";
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
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

  const params = await searchParams;
  const searchQuery = (params.q || "").trim().slice(0, 100);
  const currentFilter = parseFilter(params.filter);
  const requestedPage = parsePage(params.page);
  const where: Prisma.UserWhereInput = {};

  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  if (currentFilter === "verified") where.isVerified = true;
  if (currentFilter === "admin") where.isAdmin = true;
  if (currentFilter === "suspended") where.isSuspended = true;

  const totalUsers = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const users = await prisma.user.findMany({
    where,
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
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="min-h-svh bg-surface-canvas">
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
          searchQuery={searchQuery}
          currentFilter={currentFilter}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
