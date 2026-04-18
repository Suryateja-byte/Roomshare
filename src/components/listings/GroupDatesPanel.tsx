"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { GroupSummary } from "@/lib/search-types";

type GroupDatesCanonical = {
  id: string;
  moveInDate?: Date | string;
  publicAvailability?: {
    availableFrom?: Date | string | null;
  } | null;
};

export interface GroupDatesSharedProps {
  canonical: GroupDatesCanonical;
  summary: GroupSummary;
  onMemberClick?: (memberId: string, index: number) => void;
  onOverflowClick?: () => void;
}

export interface GroupDatesPanelProps extends GroupDatesSharedProps {
  panelId: string;
  triggerId?: string;
  onClose?: () => void;
}

type GroupDateEntry = {
  memberId: string;
  shortLabel: string;
  longLabel: string;
};

function normalizeDateToIso(value?: Date | string | null): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const directMatch = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
    if (directMatch) {
      return directMatch[1];
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function parseIsoDate(isoDate: string): Date | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGroupDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions
): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;

  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(parsed);
}

function buildGroupDateEntries(
  canonical: GroupDatesCanonical,
  summary: GroupSummary
): GroupDateEntry[] {
  const canonicalIso = normalizeDateToIso(
    canonical.publicAvailability?.availableFrom ?? canonical.moveInDate
  );
  const remainingSiblingIds = [...summary.siblingIds];

  return summary.availableFromDates.map((isoDate) => {
    const memberId =
      canonicalIso && isoDate === canonicalIso
        ? canonical.id
        : (remainingSiblingIds.shift() ?? canonical.id);

    return {
      memberId,
      shortLabel: `Available ${formatGroupDate(isoDate, {
        month: "short",
        day: "numeric",
      })}`,
      longLabel: `Available ${formatGroupDate(isoDate, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`,
    };
  });
}

export function GroupDatesActionList({
  canonical,
  summary,
  onMemberClick,
  onOverflowClick,
  autoFocusFirstChip = false,
  onClose,
  className,
}: GroupDatesSharedProps & {
  autoFocusFirstChip?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const firstChipRef = useRef<HTMLButtonElement | null>(null);
  const entries = useMemo(
    () => buildGroupDateEntries(canonical, summary),
    [canonical, summary]
  );

  useEffect(() => {
    if (!autoFocusFirstChip) return;
    firstChipRef.current?.focus();
  }, [autoFocusFirstChip]);

  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose?.();
        }
      }}
    >
      {entries.map((entry, index) => (
        <button
          key={`${entry.memberId}-${entry.shortLabel}`}
          ref={index === 0 ? firstChipRef : null}
          type="button"
          data-testid="group-dates-chip"
          aria-label={entry.longLabel}
          className="inline-flex min-h-[40px] items-center rounded-full border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-highest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          onClick={() => onMemberClick?.(entry.memberId, index)}
        >
          {entry.shortLabel}
        </button>
      ))}
      {summary.groupOverflow ? (
        <button
          type="button"
          data-testid="group-dates-overflow"
          className="inline-flex min-h-[40px] items-center rounded-full px-2 py-2 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          onClick={onOverflowClick}
        >
          See all dates →
        </button>
      ) : null}
    </div>
  );
}

export default function GroupDatesPanel({
  canonical,
  summary,
  panelId,
  triggerId,
  onMemberClick,
  onOverflowClick,
  onClose,
}: GroupDatesPanelProps) {
  return (
    <div
      id={panelId}
      role="region"
      aria-labelledby={triggerId ?? `${panelId}-trigger`}
      data-testid="group-dates-panel"
      className={cn(
        "border-t border-outline-variant/20 px-4 pb-4 pt-3",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 motion-reduce:animate-none"
      )}
    >
      <GroupDatesActionList
        canonical={canonical}
        summary={summary}
        onMemberClick={onMemberClick}
        onOverflowClick={onOverflowClick}
        onClose={onClose}
        autoFocusFirstChip
      />
    </div>
  );
}

export { buildGroupDateEntries };
