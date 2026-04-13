"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  approveVerification,
  rejectVerification,
} from "@/app/actions/verification";
import UserAvatar from "@/components/UserAvatar";
import {
  Check,
  X,
  Clock,
  FileText,
  CreditCard,
  Fingerprint,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface VerificationRequest {
  id: string;
  userId: string;
  documentType: string;
  documentUrl: string;
  selfieUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface VerificationListProps {
  initialRequests: VerificationRequest[];
}

const documentTypeIcons: Record<string, React.ReactNode> = {
  passport: <FileText className="w-4 h-4" />,
  driver_license: <CreditCard className="w-4 h-4" />,
  national_id: <Fingerprint className="w-4 h-4" />,
};

const documentTypeLabels: Record<string, string> = {
  passport: "Passport",
  driver_license: "Driver's License",
  national_id: "National ID",
};

export default function VerificationList({
  initialRequests,
}: VerificationListProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [filter, setFilter] = useState<
    "all" | "PENDING" | "APPROVED" | "REJECTED"
  >("all");
  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const result = await approveVerification(requestId);
      if (result.success) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, status: "APPROVED" as const, reviewedAt: new Date() }
              : r
          )
        );
      }
    } catch (error) {
      console.error("Error approving:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!rejectReason.trim()) {
      toast.warning("Please provide a reason for rejection");
      return;
    }

    setProcessingId(requestId);
    try {
      const result = await rejectVerification(requestId, rejectReason);
      if (result.success) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: "REJECTED" as const,
                  adminNotes: rejectReason,
                  reviewedAt: new Date(),
                }
              : r
          )
        );
        setRejectingId(null);
        setRejectReason("");
      }
    } catch (error) {
      console.error("Error rejecting:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filter === f
                ? "bg-on-surface text-white"
                : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high/50 border border-outline-variant/20"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            {f !== "all" && (
              <span className="ml-2 text-xs opacity-70">
                ({requests.filter((r) => r.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient-sm p-12 text-center">
            <p className="text-on-surface-variant">
              No verification requests found
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <div
              key={request.id}
              className={`bg-surface-container-lowest rounded-lg shadow-ambient-sm overflow-hidden ${
                request.status === "PENDING"
                  ? "border-outline-variant/20"
                  : "border-outline-variant/20"
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* User Info */}
                  <div className="flex items-start gap-4">
                    <UserAvatar
                      image={request.user.image}
                      name={request.user.name}
                      size="lg"
                    />
                    <div>
                      <h3 className="font-semibold text-on-surface">
                        {request.user.name || "Unknown User"}
                      </h3>
                      <p className="text-sm text-on-surface-variant">
                        {request.user.email}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      request.status === "PENDING"
                        ? "bg-amber-100 text-amber-700"
                        : request.status === "APPROVED"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {request.status === "PENDING" && (
                      <Clock className="w-3 h-3 inline mr-1" />
                    )}
                    {request.status === "APPROVED" && (
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />
                    )}
                    {request.status === "REJECTED" && (
                      <XCircle className="w-3 h-3 inline mr-1" />
                    )}
                    {request.status}
                  </div>
                </div>

                {/* Document Info */}
                <div className="mt-4 p-4 bg-surface-canvas rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {documentTypeIcons[request.documentType]}
                    <span className="font-medium text-on-surface">
                      {documentTypeLabels[request.documentType] ||
                        request.documentType}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <a
                      href={request.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      View Document <ExternalLink className="w-3 h-3" />
                    </a>
                    {request.selfieUrl && (
                      <a
                        href={request.selfieUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        View Selfie <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    Submitted {new Date(request.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Admin Notes (for rejected) */}
                {request.status === "REJECTED" && request.adminNotes && (
                  <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-sm text-red-700">
                      <strong>Rejection reason:</strong> {request.adminNotes}
                    </p>
                  </div>
                )}

                {/* Actions */}
                {request.status === "PENDING" && (
                  <div className="mt-4 flex items-center gap-3">
                    {rejectingId === request.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="flex-1 px-3 py-2 border border-outline-variant/20 bg-surface-container-lowest text-on-surface rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          onClick={() => handleReject(request.id)}
                          disabled={processingId === request.id}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                        >
                          {processingId === request.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Confirm Reject"
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                          className="px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-lg text-sm font-medium hover:bg-surface-container-high/80"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingId === request.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                        >
                          {processingId === request.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Approve
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setRejectingId(request.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
