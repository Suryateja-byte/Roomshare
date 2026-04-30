import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma, ReportStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, Flag } from "lucide-react";
import ReportList from "./ReportList";
import { requireAdmin } from "@/app/actions/admin";

export const metadata = {
  title: "Reports Management | Admin | RoomShare",
  description: "Manage reports on the RoomShare platform",
};

const ALLOWED_REPORT_KINDS = ["ABUSE_REPORT", "PRIVATE_FEEDBACK"] as const;
const ALLOWED_REPORT_STATUSES = [
  "all",
  "OPEN",
  "RESOLVED",
  "DISMISSED",
] as const;
const PAGE_SIZE = 50;

type AdminReportsPageProps = {
  searchParams: Promise<{ kind?: string; status?: string; page?: string }>;
};

type ReportKindFilter = "all" | (typeof ALLOWED_REPORT_KINDS)[number];
type ReportStatusFilter = (typeof ALLOWED_REPORT_STATUSES)[number];

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
  const adminCheck = await requireAdmin();
  if (adminCheck.code === "SESSION_EXPIRED") {
    redirect("/login?callbackUrl=/admin/reports");
  }

  if (adminCheck.error) {
    redirect("/");
  }

  const params = await searchParams;
  const rawKind = params.kind;
  const kindFilter: ReportKindFilter = ALLOWED_REPORT_KINDS.includes(
    rawKind as (typeof ALLOWED_REPORT_KINDS)[number]
  )
    ? (rawKind as (typeof ALLOWED_REPORT_KINDS)[number])
    : "all";
  const statusFilter: ReportStatusFilter = ALLOWED_REPORT_STATUSES.includes(
    params.status as ReportStatusFilter
  )
    ? (params.status as ReportStatusFilter)
    : "all";
  const requestedPage = parsePage(params.page);
  const where: Prisma.ReportWhereInput = {};
  if (kindFilter !== "all") where.kind = kindFilter;
  if (statusFilter !== "all") where.status = statusFilter as ReportStatus;

  const [totalReports, openReportsCount] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.count({
      where: {
        status: "OPEN",
        ...(kindFilter !== "all" ? { kind: kindFilter } : {}),
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalReports / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const reports = await prisma.report.findMany({
    where,
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          images: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { status: "asc" }, // OPEN first
      { createdAt: "desc" },
    ],
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
            <div className="p-3 bg-red-100 rounded-lg relative">
              <Flag className="w-6 h-6 text-red-600" />
              {openReportsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {openReportsCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface">
                Reports Management
              </h1>
              <p className="text-on-surface-variant">
                Review abuse reports and private feedback
              </p>
            </div>
          </div>
        </div>

        {/* Report List */}
        <ReportList
          initialReports={reports}
          totalReports={totalReports}
          initialKindFilter={kindFilter}
          initialStatusFilter={statusFilter}
          openReportsCount={openReportsCount}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
