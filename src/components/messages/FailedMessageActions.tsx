"use client";

import { RotateCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FailedMessageActionsProps {
  onRetry?: () => void;
  onDelete?: () => void;
  retryDisabled?: boolean;
  deleteDisabled?: boolean;
  retryTestId?: string;
  deleteTestId?: string;
  className?: string;
}

export function FailedMessageActions({
  onRetry,
  onDelete,
  retryDisabled = false,
  deleteDisabled = false,
  retryTestId = "retry-message-button",
  deleteTestId = "delete-message-button",
  className,
}: FailedMessageActionsProps) {
  return (
    <div
      data-testid="failed-message-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRetry}
        disabled={!onRetry || retryDisabled}
        data-testid={retryTestId}
        className="h-8 min-h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
      >
        <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Retry
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={!onDelete || deleteDisabled}
        data-testid={deleteTestId}
        className="h-8 min-h-8 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Delete
      </Button>
    </div>
  );
}
