import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Users,
  Home,
  FileCheck,
  Flag,
  MessageSquare,
  TrendingUp,
  Shield,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Admin Dashboard | RoomShare",
  description: "RoomShare administration dashboard for platform management.",
  robots: { index: false, follow: false },
};

async function getAdminStats() {
  const [
    usersCount,
    listingsCount,
    activeListingsCount,
    pendingVerifications,
    pendingReports,
    messagesCount,
    verifiedUsersCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.verificationRequest.count({ where: { status: "PENDING" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.message.count(),
    prisma.user.count({ where: { isVerified: true } }),
  ]);

  return {
    usersCount,
    listingsCount,
    activeListingsCount,
    pendingVerifications,
    pendingReports,
    messagesCount,
    verifiedUsersCount,
  };
}

export default async function AdminDashboard() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/");
  }

  const stats = await getAdminStats();

  const statCards = [
    {
      label: "Total Users",
      value: stats.usersCount,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      label: "Verified Users",
      value: stats.verifiedUsersCount,
      icon: Shield,
      color: "bg-green-500",
    },
    {
      label: "Total Listings",
      value: stats.listingsCount,
      icon: Home,
      color: "bg-purple-500",
    },
    {
      label: "Active Listings",
      value: stats.activeListingsCount,
      icon: TrendingUp,
      color: "bg-teal-500",
    },
    {
      label: "Pending Verifications",
      value: stats.pendingVerifications,
      icon: FileCheck,
      color: "bg-amber-500",
      alert: stats.pendingVerifications > 0,
    },
    {
      label: "Reports",
      value: stats.pendingReports,
      icon: Flag,
      color: "bg-red-500",
      alert: stats.pendingReports > 0,
    },
    {
      label: "Messages Sent",
      value: stats.messagesCount,
      icon: MessageSquare,
      color: "bg-pink-500",
    },
  ];

  const adminLinks = [
    {
      label: "Verification Requests",
      href: "/admin/verifications",
      icon: FileCheck,
      count: stats.pendingVerifications,
    },
    { label: "User Management", href: "/admin/users", icon: Users },
    { label: "Listing Moderation", href: "/admin/listings", icon: Home },
    {
      label: "Reports",
      href: "/admin/reports",
      icon: Flag,
      count: stats.pendingReports,
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-on-surface">
            Admin Dashboard
          </h1>
          <p className="text-on-surface-variant mt-1">
            Manage your RoomShare platform
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className={`bg-surface-container-lowest rounded-lg p-6 shadow-ambient-sm relative overflow-hidden ${
                stat.alert ? "ring-2 ring-amber-400" : ""
              }`}
            >
              <div
                className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 ${stat.color} opacity-10 rounded-full`}
              />
              <div
                className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center mb-3`}
              >
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-on-surface">
                {stat.value.toLocaleString()}
              </p>
              <p className="text-sm text-on-surface-variant">{stat.label}</p>
              {stat.alert && (
                <span className="absolute top-3 right-3 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient-sm overflow-hidden mb-8">
          <div className="px-6 py-4 bg-surface-container-high">
            <h2 className="text-lg font-display font-semibold text-on-surface">
              Quick Actions
            </h2>
          </div>
          <div className="space-y-px">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between px-6 py-4 hover:bg-surface-container-high/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-surface-container-high rounded-lg flex items-center justify-center">
                    <link.icon className="w-5 h-5 text-on-surface-variant" />
                  </div>
                  <span className="font-medium text-on-surface">
                    {link.label}
                  </span>
                </div>
                {link.count !== undefined && link.count > 0 && (
                  <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-sm font-medium">
                    {link.count} pending
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity - Placeholder */}
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient-sm overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-high">
            <h2 className="text-lg font-display font-semibold text-on-surface">
              Recent Activity
            </h2>
          </div>
          <div className="p-6 text-center text-on-surface-variant">
            <p>Activity log coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
