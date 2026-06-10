import { cn } from "@/lib/utils";
import type { MessageTimestamp } from "./types";
import { getThreadDayLabel } from "./useMessageThread";

export interface DaySeparatorProps {
  date: MessageTimestamp;
  label?: string;
  className?: string;
}

export function DaySeparator({ date, label, className }: DaySeparatorProps) {
  const dateValue = new Date(date);
  const displayLabel = label ?? getThreadDayLabel(dateValue);

  return (
    <div
      role="separator"
      aria-label={displayLabel}
      data-testid="message-day-separator"
      className={cn("my-4 flex items-center justify-center", className)}
    >
      <time
        dateTime={dateValue.toISOString()}
        className="rounded-full bg-surface-container-high px-3 py-1 text-xs text-on-surface-variant"
      >
        {displayLabel}
      </time>
    </div>
  );
}
