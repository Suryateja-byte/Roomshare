"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Home, ChevronDown } from "lucide-react";
import {
  updateListingStatus,
  ListingStatus,
} from "@/app/actions/listing-status";
import {
  getModerationWriteLockReason,
  LISTING_LOCKED_ERROR_MESSAGE,
} from "@/lib/listings/moderation-write-lock";

interface ListingStatusToggleProps {
  listingId: string;
  currentStatus: ListingStatus;
  currentVersion: number;
  currentStatusReason?: string | null;
  moderationWriteLocksEnabled?: boolean;
}

const statusConfig = {
  ACTIVE: {
    label: "Active",
    description: "Visible to everyone",
    icon: Eye,
    color: "bg-green-100 text-green-700 border-green-200",
    dotColor: "bg-green-500",
  },
  PAUSED: {
    label: "Paused",
    description: "Hidden from search",
    icon: EyeOff,
    color: "bg-yellow-100 text-yellow-700 border-outline-variant/20",
    dotColor: "bg-yellow-500",
  },
  RENTED: {
    label: "Rented",
    description: "Marked as rented",
    icon: Home,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dotColor: "bg-blue-500",
  },
};

export default function ListingStatusToggle({
  listingId,
  currentStatus,
  currentVersion,
  currentStatusReason = null,
  moderationWriteLocksEnabled = false,
}: ListingStatusToggleProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ListingStatus>(currentStatus);
  const [version, setVersion] = useState(currentVersion);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);
  const awaitingRefreshRef = useRef(false);
  const isLockedFromProps =
    moderationWriteLocksEnabled &&
    getModerationWriteLockReason(currentStatusReason) !== null;

  useEffect(() => {
    setStatus(currentStatus);
    setVersion(currentVersion);
    if (awaitingRefreshRef.current) {
      awaitingRefreshRef.current = false;
      setAwaitingRefresh(false);
    }
  }, [currentStatus, currentVersion, currentStatusReason]);

  const config = statusConfig[status];
  const isInteractionDisabled =
    isUpdating || awaitingRefresh || isLockedFromProps;

  const handleStatusChange = async (newStatus: ListingStatus) => {
    if (newStatus === status || isInteractionDisabled) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    const result = await updateListingStatus(listingId, newStatus, version);

    if (result.error) {
      if (result.code === "VERSION_CONFLICT") {
        awaitingRefreshRef.current = true;
        setAwaitingRefresh(true);
        toast.error("Listing changed elsewhere. Refreshing the latest version...");
        router.refresh();
      } else if (result.code === "LISTING_LOCKED") {
        awaitingRefreshRef.current = true;
        setAwaitingRefresh(true);
        toast.error(LISTING_LOCKED_ERROR_MESSAGE);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } else {
      setStatus(result.status ?? newStatus);
      if (typeof result.version === "number") {
        setVersion(result.version);
      }
      router.refresh();
    }

    setIsUpdating(false);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isInteractionDisabled}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${config.color} transition-all hover:shadow-ambient disabled:opacity-60`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
        <span className="font-medium text-sm">{config.label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 mt-2 w-56 bg-surface-container-lowest rounded-xl shadow-ambient-lg border border-outline-variant/20 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
            <p className="px-4 py-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Listing Status
            </p>
            {(Object.keys(statusConfig) as ListingStatus[]).map((statusKey) => {
              const itemConfig = statusConfig[statusKey];
              const ItemIcon = itemConfig.icon;
              const isSelected = statusKey === status;

              return (
                <button
                  key={statusKey}
                  onClick={() => handleStatusChange(statusKey)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-canvas transition-colors ${isSelected ? "bg-surface-canvas" : ""}`}
                >
                  <div className={`p-2 rounded-lg ${itemConfig.color}`}>
                    <ItemIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-on-surface">
                      {itemConfig.label}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {itemConfig.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-on-surface" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
