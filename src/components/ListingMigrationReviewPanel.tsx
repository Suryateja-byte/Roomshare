"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { reviewListingMigration as reviewListingMigrationByAdmin } from "@/app/actions/admin";
import { reviewListingMigration as reviewListingMigrationByHost } from "@/app/actions/listing-status";
import type {
  ListingMigrationReviewState,
  ReviewListingMigrationSuccess,
} from "@/lib/migration/review";

interface ListingMigrationReviewPanelProps {
  actor: "host" | "admin";
  listingId: string;
  expectedVersion: number;
  reviewState: ListingMigrationReviewState | null;
  editHref?: string;
  onReviewed?: (result: ReviewListingMigrationSuccess) => void;
}

const COHORT_LABELS: Record<
  ListingMigrationReviewState["cohort"],
  string
> = {
  clean_auto_convert: "Clean auto-convert",
  blocked_legacy_state: "Blocked legacy state",
  manual_review: "Manual review",
};

const SEVERITY_STYLES = {
  blocked: "bg-red-100 text-red-700",
  fix: "bg-amber-100 text-amber-700",
  info: "bg-slate-100 text-slate-700",
} as const;

export default function ListingMigrationReviewPanel({
  actor,
  listingId,
  expectedVersion,
  reviewState,
  editHref,
  onReviewed,
}: ListingMigrationReviewPanelProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!reviewState?.isReviewRequired) {
    return null;
  }

  const handleReview = async () => {
    if (isSubmitting) {
      return;
    }

    setActionError(null);
    setIsSubmitting(true);

    const result =
      actor === "admin"
        ? await reviewListingMigrationByAdmin(listingId, expectedVersion)
        : await reviewListingMigrationByHost(listingId, expectedVersion);

    if (!("success" in result) || !result.success) {
      const failure = result as { error: string; code?: string };
      if (failure.code === "VERSION_CONFLICT") {
        toast.error("Listing changed elsewhere. Refreshing the latest version...");
        router.refresh();
      } else {
        setActionError(failure.error);
        toast.error(failure.error);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(
      reviewState.availabilitySource === "HOST_MANAGED"
        ? "Listing marked reviewed and kept paused."
        : "Listing converted to host-managed and kept paused."
    );
    onReviewed?.(result);
    router.refresh();
    setIsSubmitting(false);
  };

  const visibilityLabel = reviewState.searchEligible
    ? "Currently search-eligible"
    : "Currently hidden from search";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            Migration review required
          </div>
          <p className="text-sm text-amber-900/80">
            This listing was not eligible for automatic migration. Keep it
            paused until the review blockers are resolved and the listing is
            explicitly reviewed.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">
              {COHORT_LABELS[reviewState.cohort]}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">
              Public status: {reviewState.publicStatus}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                reviewState.searchEligible
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              {visibilityLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {editHref && actor === "admin" && (
            <Link
              href={editHref}
              className="inline-flex items-center justify-center rounded-xl border border-outline-variant/20 bg-white px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-canvas"
            >
              Open listing
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleReview()}
            disabled={isSubmitting || !reviewState.canReviewNow}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-on-surface px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {reviewState.reviewActionLabel}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">
            Review findings
          </p>
          <div className="mt-2 space-y-2">
            {reviewState.reasons.map((reason) => (
              <div
                key={reason.code}
                className="rounded-xl border border-amber-200/70 bg-white px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[reason.severity]}`}
                  >
                    {reason.severity === "blocked"
                      ? "Blocked"
                      : reason.severity === "fix"
                        ? "Needs fix"
                        : "Review note"}
                  </span>
                  <span className="text-sm font-medium text-slate-900">
                    {reason.summary}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{reason.fixHint}</p>
              </div>
            ))}
          </div>
        </div>

        {actionError && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {!reviewState.canReviewNow && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-white px-3 py-3 text-sm text-amber-900/80">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              Resolve the required fixes first. The review action stays paused
              and will only succeed when the current listing data passes the
              host-managed validation rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
