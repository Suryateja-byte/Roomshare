"use client";

import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  recoverHostManagedListing,
  type HostManagedRecoveryMode,
} from "@/app/actions/listing-status";

interface ListingFreshnessCheckProps {
  listingId: string;
  checkInterval?: number;
  canManage?: boolean;
  reviewHref?: string;
}

interface ListingStatusSnapshot {
  id: string;
  version?: number;
  availabilitySource?: "LEGACY_BOOKING" | "HOST_MANAGED";
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  publicStatus: string;
  searchEligible: boolean;
  freshnessBucket: string;
  lastConfirmedAt: string | null;
  staleAt: string | null;
  autoPauseAt: string | null;
}

const MAX_BACKOFF_INTERVAL = 300000;
const BACKOFF_MULTIPLIER = 2;

const statusReasonLabels: Record<string, string> = {
  NO_OPEN_SLOTS: "No open slots remaining",
  AVAILABLE_UNTIL_PASSED: "Availability window has ended",
  HOST_PAUSED: "Paused by host",
  ADMIN_PAUSED: "Paused by admin",
  MIGRATION_REVIEW: "Requires migration review",
  STALE_AUTO_PAUSE: "Auto-paused until availability is reconfirmed",
  MANUAL_CLOSED: "Closed by host",
};

const freshnessBucketLabels: Record<string, string> = {
  NOT_APPLICABLE: "Not applicable",
  UNCONFIRMED: "Unconfirmed",
  NORMAL: "Fresh",
  REMINDER: "Reminder due",
  STALE: "Stale",
  AUTO_PAUSE_DUE: "Auto-pause due",
};

const publicStatusLabels: Record<string, string> = {
  AVAILABLE: "Available",
  FULL: "Full",
  CLOSED: "Closed",
  PAUSED: "Paused",
  NEEDS_RECONFIRMATION: "Needs reconfirmation",
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not set";
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatEnum(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SnapshotRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-canvas px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-on-surface">{value}</p>
    </div>
  );
}

export default function ListingFreshnessCheck({
  listingId,
  checkInterval = 30000,
  canManage = false,
  reviewHref,
}: ListingFreshnessCheckProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [snapshot, setSnapshot] = useState<ListingStatusSnapshot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] =
    useState<HostManagedRecoveryMode | null>(null);
  const router = useRouter();

  const failureCountRef = useRef(0);
  const currentIntervalRef = useRef(checkInterval);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const scheduleNextCheck = useCallback((interval: number) => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
    }
    intervalIdRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkListingStatus();
      }
    }, interval);
  }, []);

  const checkListingStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/listings/${listingId}/status`, {
        method: "GET",
        cache: "no-store",
      });

      if (!isMountedRef.current) {
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        return;
      }

      const data = (await response.json()) as ListingStatusSnapshot & {
        error?: string;
      };

      if (failureCountRef.current > 0) {
        failureCountRef.current = 0;
        currentIntervalRef.current = checkInterval;
        scheduleNextCheck(checkInterval);
      }

      if (response.status === 404 && data.error === "Listing not found") {
        setIsDeleted(true);
        setSnapshot(null);
        return;
      }

      if (!response.ok) {
        return;
      }

      setSnapshot(data);
      setIsDeleted(false);

      if (!canManage) {
        if (data.status === "PAUSED" || data.status === "RENTED") {
          setIsUnavailable(true);
        } else {
          setIsUnavailable(false);
        }
      }
    } catch {
      failureCountRef.current += 1;
      const newInterval = Math.min(
        checkInterval * Math.pow(BACKOFF_MULTIPLIER, failureCountRef.current),
        MAX_BACKOFF_INTERVAL
      );

      if (newInterval !== currentIntervalRef.current) {
        currentIntervalRef.current = newInterval;
        scheduleNextCheck(newInterval);
      }
    }
  }, [canManage, checkInterval, listingId, scheduleNextCheck]);

  useEffect(() => {
    isMountedRef.current = true;
    failureCountRef.current = 0;
    currentIntervalRef.current = checkInterval;

    void checkListingStatus();
    scheduleNextCheck(checkInterval);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkListingStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkInterval, checkListingStatus, scheduleNextCheck]);

  const handleRecovery = async (mode: HostManagedRecoveryMode) => {
    if (!snapshot || typeof snapshot.version !== "number") {
      toast.error("Could not load the latest listing version. Reload and try again.");
      return;
    }

    setActionError(null);
    setIsRecovering(mode);

    const result = await recoverHostManagedListing(
      listingId,
      snapshot.version,
      mode
    );

    if (result.error) {
      if (result.code === "VERSION_CONFLICT") {
        toast.error("Listing changed elsewhere. Reloaded the latest version.");
        router.refresh();
        void checkListingStatus();
      } else {
        setActionError(result.error);
        toast.error(result.error);
      }
      setIsRecovering(null);
      return;
    }

    toast.success(
      mode === "REOPEN" ? "Listing reopened." : "Availability confirmed."
    );
    router.refresh();
    await checkListingStatus();
    setIsRecovering(null);
  };

  if (!canManage) {
    if (isDeleted) {
      return (
        <div className="fixed top-20 left-0 right-0 z-50 mx-4 sm:mx-auto sm:max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-red-50 border border-outline-variant/20 rounded-xl p-4 shadow-ambient">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">
                  Listing No Longer Available
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  This listing has been removed by the host.
                </p>
                <button
                  onClick={() => router.push("/search")}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Find Other Listings
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (isUnavailable) {
      return (
        <div className="fixed top-20 left-0 right-0 z-50 mx-4 sm:mx-auto sm:max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="bg-amber-50 border border-outline-variant/20 rounded-xl p-4 shadow-ambient">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">
                  Listing Currently Unavailable
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  The host has paused or marked this listing as rented.
                </p>
                <button
                  onClick={() => router.refresh()}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  if (isDeleted) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-900">
          This listing no longer exists.
        </p>
      </div>
    );
  }

  if (!snapshot || snapshot.availabilitySource !== "HOST_MANAGED") {
    return null;
  }

  const needsReviewAndReopen =
    snapshot.publicStatus === "NEEDS_RECONFIRMATION" ||
    snapshot.freshnessBucket === "STALE" ||
    snapshot.status !== "ACTIVE" ||
    !snapshot.searchEligible;

  const statusReasonLabel =
    (snapshot.statusReason && statusReasonLabels[snapshot.statusReason]) ||
    formatEnum(snapshot.statusReason);

  return (
    <div className="rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-ambient-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Clock3 className="h-4 w-4 text-on-surface-variant" />
            Availability freshness
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">
            {needsReviewAndReopen
              ? "This listing is hidden from search or paused. Review the current availability and reopen only when the listing still meets host-managed rules."
              : "This listing is still marketable. Reconfirm availability to reset freshness before it goes stale."}
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            snapshot.searchEligible
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          {snapshot.searchEligible ? "Search eligible" : "Hidden from search"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SnapshotRow
          label="Public status"
          value={publicStatusLabels[snapshot.publicStatus] ?? snapshot.publicStatus}
        />
        <SnapshotRow label="Listing status" value={formatEnum(snapshot.status)} />
        <SnapshotRow label="Status reason" value={statusReasonLabel} />
        <SnapshotRow
          label="Freshness bucket"
          value={
            freshnessBucketLabels[snapshot.freshnessBucket] ??
            snapshot.freshnessBucket
          }
        />
        <SnapshotRow
          label="Last confirmed"
          value={formatDateTime(snapshot.lastConfirmedAt)}
        />
        <SnapshotRow label="Stale at" value={formatDateTime(snapshot.staleAt)} />
        <SnapshotRow
          label="Auto-pause at"
          value={formatDateTime(snapshot.autoPauseAt)}
        />
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!needsReviewAndReopen && (
          <button
            type="button"
            onClick={() => void handleRecovery("RECONFIRM")}
            disabled={isRecovering !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-on-surface px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRecovering === "RECONFIRM" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Still available
          </button>
        )}

        {needsReviewAndReopen &&
          (reviewHref ? (
            <Link
              href={reviewHref}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-canvas px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <RefreshCw className="h-4 w-4" />
              Review and reopen
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void handleRecovery("REOPEN")}
              disabled={isRecovering !== null}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-canvas px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRecovering === "REOPEN" ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Review and reopen
            </button>
          ))}
      </div>
    </div>
  );
}
