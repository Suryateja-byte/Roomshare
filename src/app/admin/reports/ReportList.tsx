"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  resolveReport,
  resolveReportAndRemoveListing,
} from "@/app/actions/admin";
import UserAvatar from "@/components/UserAvatar";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Trash2,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  listing: {
    id: string;
    title: string;
    images: string[];
    owner: {
      id: string;
      name: string | null;
      email: string | null;
    };
  };
  reporter: {
    id: string;
    name: string | null;
    email: string | null;
  };
  reviewer: {
    id: string;
    name: string | null;
  } | null;
}

interface ReportListProps {
  initialReports: Report[];
  totalReports: number;
}

const statusConfig = {
  OPEN: { label: "Open", color: "bg-amber-100 text-amber-700", icon: Clock },
  RESOLVED: {
    label: "Resolved",
    color: "bg-green-100 text-green-700",
    icon: CheckCircle2,
  },
  DISMISSED: {
    label: "Dismissed",
    color: "bg-surface-container-high text-on-surface",
    icon: XCircle,
  },
};

export default function ReportList({
  initialReports,
  totalReports,
}: ReportListProps) {
  const [reports, setReports] = useState(initialReports);
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionModalId, setActionModalId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [selectedAction, setSelectedAction] = useState<
    "resolve" | "dismiss" | "remove" | null
  >(null);

  const handleAction = async (reportId: string) => {
    if (!selectedAction) return;

    setProcessingId(reportId);
    try {
      let result;

      if (selectedAction === "remove") {
        result = await resolveReportAndRemoveListing(reportId, adminNotes);
      } else {
        result = await resolveReport(
          reportId,
          selectedAction === "resolve" ? "RESOLVED" : "DISMISSED",
          adminNotes
        );
      }

      if (result.success) {
        if (selectedAction === "remove") {
          // Remove report from list since listing is deleted
          setReports((prev) => prev.filter((r) => r.id !== reportId));
        } else {
          setReports((prev) =>
            prev.map((r) =>
              r.id === reportId
                ? ({
                    ...r,
                    status:
                      selectedAction === "resolve" ? "RESOLVED" : "DISMISSED",
                    adminNotes,
                    resolvedAt: new Date(),
                  } as Report)
                : r
            )
          );
        }
        setActionModalId(null);
        setAdminNotes("");
        setSelectedAction(null);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error("Error processing report:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredReports =
    statusFilter === "all"
      ? reports
      : reports.filter((r) => r.status === statusFilter);

  const openCount = reports.filter((r) => r.status === "OPEN").length;

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "OPEN", "RESOLVED", "DISMISSED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === f
                ? "bg-on-surface text-white"
                : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high/50 border border-outline-variant/20"
            }`}
          >
            {f === "all" ? "All" : statusConfig[f].label}
            {f === "OPEN" && openCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="mb-4 text-sm text-on-surface-variant">
        Showing {filteredReports.length} of {totalReports} reports
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {filteredReports.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient-sm p-12 text-center text-on-surface-variant">
            No reports found
          </div>
        ) : (
          filteredReports.map((report) => {
            const StatusIcon = statusConfig[report.status].icon;

            return (
              <div
                key={report.id}
                className={`bg-surface-container-lowest rounded-lg shadow-ambient-sm overflow-hidden ${
                  report.status === "OPEN"
                    ? "border-amber-200"
                    : "border-outline-variant/20"
                }`}
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high">
                        {report.listing.images[0] ? (
                          <Image
                            src={report.listing.images[0]}
                            alt={report.listing.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      <div>
                        <Link
                          href={`/listings/${report.listing.id}`}
                          target="_blank"
                          className="font-semibold text-on-surface hover:text-primary flex items-center gap-1"
                        >
                          {report.listing.title}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                        <p className="text-sm text-on-surface-variant">
                          Listed by: {report.listing.owner.name || "Unknown"} (
                          {report.listing.owner.email})
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig[report.status].color}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig[report.status].label}
                    </span>
                  </div>

                  {/* Report Details */}
                  <div className="p-4 bg-surface-canvas rounded-lg mb-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-on-surface">
                          {report.reason}
                        </p>
                        {report.details && (
                          <p className="text-sm text-on-surface-variant mt-1">
                            {report.details}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reporter Info */}
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant mb-4">
                    <UserAvatar
                      image={null}
                      name={report.reporter.name}
                      size="sm"
                    />
                    <span>
                      Reported by {report.reporter.name || "Unknown"} (
                      {report.reporter.email})
                    </span>
                    <span className="text-on-surface-variant">
                      on {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Admin Notes (if resolved/dismissed) */}
                  {report.status !== "OPEN" && report.adminNotes && (
                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 mb-4">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-primary">
                            <strong>Admin notes:</strong> {report.adminNotes}
                          </p>
                          {report.reviewer && (
                            <p className="text-xs text-primary mt-1">
                              - {report.reviewer.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {report.status === "OPEN" && (
                    <>
                      {actionModalId === report.id ? (
                        <div className="p-4 bg-surface-canvas rounded-lg border border-outline-variant/20">
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-on-surface mb-2">
                              Admin Notes (optional)
                            </label>
                            <textarea
                              value={adminNotes}
                              onChange={(e) => setAdminNotes(e.target.value)}
                              placeholder="Add notes about your decision..."
                              rows={2}
                              className="w-full px-3 py-2 border border-outline-variant/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                setSelectedAction("resolve");
                                handleAction(report.id);
                              }}
                              disabled={processingId === report.id}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                            >
                              {processingId === report.id &&
                              selectedAction === "resolve" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                              Mark Resolved
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAction("dismiss");
                                handleAction(report.id);
                              }}
                              disabled={processingId === report.id}
                              className="flex items-center gap-2 px-4 py-2 bg-on-surface-variant text-white rounded-lg text-sm font-medium hover:bg-on-surface-variant/80 disabled:opacity-60"
                            >
                              {processingId === report.id &&
                              selectedAction === "dismiss" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                              Dismiss Report
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAction("remove");
                                handleAction(report.id);
                              }}
                              disabled={processingId === report.id}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                            >
                              {processingId === report.id &&
                              selectedAction === "remove" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              Remove Listing
                            </button>
                            <button
                              onClick={() => {
                                setActionModalId(null);
                                setAdminNotes("");
                                setSelectedAction(null);
                              }}
                              className="px-4 py-2 bg-surface-container-lowest text-on-surface-variant rounded-lg text-sm font-medium hover:bg-surface-container-high border border-outline-variant/20"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActionModalId(report.id)}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
                        >
                          Take Action
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
