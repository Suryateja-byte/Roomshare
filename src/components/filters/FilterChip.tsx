"use client";

/**
 * FilterChip - Individual removable filter chip
 *
 * Displays a filter value as a pill-shaped chip with a remove button.
 * Fully keyboard accessible with proper ARIA labels.
 * Optionally shows impact count badge on hover ("+N" more results).
 */

import { X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FilterChipProps {
  /** Display label shown on the chip */
  label: string;
  /** Called when the chip is removed */
  onRemove: () => void;
  /** Whether removal is in progress */
  isRemoving?: boolean;
  /** Impact count delta when removing (e.g., "+22") */
  impactDelta?: string | null;
  /** Whether impact count is loading */
  isImpactLoading?: boolean;
  /** Called when chip is hovered */
  onHoverStart?: () => void;
  /** Called when chip stops being hovered */
  onHoverEnd?: () => void;
  /** Additional class names */
  className?: string;
}

export function FilterChip({
  label,
  onRemove,
  isRemoving = false,
  impactDelta,
  isImpactLoading,
  onHoverStart,
  onHoverEnd,
  className,
}: FilterChipProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRemove();
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5",
        "bg-zinc-100 dark:bg-zinc-800",
        "text-sm text-zinc-700 dark:text-zinc-300",
        "rounded-full",
        "transition-colors duration-150",
        "group/chip",
        isRemoving && "opacity-50",
        className,
      )}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <span className="max-w-[200px] truncate">{label}</span>

      {/* Impact count badge - shows on hover when data is available */}
      {(impactDelta || isImpactLoading) && (
        <span
          className={cn(
            "inline-flex items-center justify-center",
            "min-w-[1.25rem] px-1 py-0.5",
            "text-2xs font-semibold",
            "rounded-full",
            "bg-emerald-100 dark:bg-emerald-900/50",
            "text-emerald-700 dark:text-emerald-300",
            impactDelta ? "opacity-100" : "opacity-0 group-hover/chip:opacity-100",
            "transition-opacity duration-150",
          )}
          aria-label={
            impactDelta
              ? `Removing this filter adds ${impactDelta} more results`
              : "Loading impact count"
          }
        >
          {isImpactLoading ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            impactDelta
          )}
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        onKeyDown={handleKeyDown}
        disabled={isRemoving}
        className={cn(
          // Visual appearance: compact rounded button
          "relative flex items-center justify-center",
          "w-4 h-4 rounded-full",
          "text-zinc-500 dark:text-zinc-400",
          "hover:bg-zinc-200 dark:hover:bg-zinc-700",
          "hover:text-zinc-700 dark:hover:text-zinc-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
          "transition-colors duration-150",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          // WCAG: 44x44px minimum touch target via pseudo-element (16px + 14px*2 = 44px)
          "before:absolute before:inset-0 before:-m-[14px] before:content-['']",
        )}
        aria-label={`Remove filter: ${label}`}
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </button>
    </span>
  );
}
