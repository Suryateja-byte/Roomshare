"use client";

import { ShieldOff, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockStatus } from "@/app/actions/block";

interface BlockedConversationBannerProps {
  blockStatus: BlockStatus;
  otherUserName?: string;
  onUnblock?: () => void;
  isUnblocking?: boolean;
}

/**
 * Compact banner component that replaces the chat input area when a conversation is blocked.
 * Shows different messages depending on whether the current user blocked or was blocked.
 */
export default function BlockedConversationBanner({
  blockStatus,
  otherUserName = "this user",
  onUnblock,
  isUnblocking = false,
}: BlockedConversationBannerProps) {
  if (!blockStatus) return null;

  if (blockStatus === "blocked") {
    // Current user was blocked by the other user
    return (
      <div className="px-6 py-4 bg-surface-container-high border-t border-outline-variant/20">
        <div className="flex items-center justify-center gap-3 text-on-surface-variant">
          <Ban className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">
            You can no longer send messages to this user.
          </p>
        </div>
      </div>
    );
  }

  if (blockStatus === "blocker") {
    // Current user blocked the other user
    return (
      <div className="px-6 py-4 bg-surface-container-high border-t border-outline-variant/20">
        <div className="flex items-center justify-center gap-3">
          <ShieldOff className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
          <p className="text-sm text-on-surface-variant">
            You have blocked {otherUserName}.
          </p>
          {onUnblock && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUnblock}
              disabled={isUnblocking}
              className="ml-2"
            >
              {isUnblocking ? "Unblocking..." : "Unblock to message"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
