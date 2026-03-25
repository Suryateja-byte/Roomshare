"use client";

import { Ban, ShieldOff } from "lucide-react";
import type { BlockStatus } from "@/app/actions/block";

interface BlockedUserMessageProps {
  status: BlockStatus;
  userName?: string;
  showUnblockOption?: boolean;
  onUnblock?: () => void;
}

export default function BlockedUserMessage({
  status,
  userName = "This user",
  showUnblockOption = false,
  onUnblock,
}: BlockedUserMessageProps) {
  if (!status) return null;

  if (status === "blocked") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-4">
          <Ban className="w-8 h-8 text-on-surface-variant" />
        </div>
        <h3 className="text-lg font-semibold text-on-surface mb-2">
          You&apos;ve Been Blocked
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm">
          {userName} has blocked you. You cannot send messages or interact with
          them.
        </p>
      </div>
    );
  }

  if (status === "blocker") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <ShieldOff className="w-8 h-8 text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-on-surface mb-2">
          User Blocked
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm mb-4">
          You have blocked {userName}. Unblock them to resume communication.
        </p>
        {showUnblockOption && onUnblock && (
          <button
            onClick={onUnblock}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-on-surface-variant bg-surface-container-high hover:bg-surface-container-high rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          >
            <ShieldOff className="w-4 h-4" />
            Unblock {userName}
          </button>
        )}
      </div>
    );
  }

  return null;
}
