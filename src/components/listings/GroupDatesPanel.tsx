"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { GroupSummary, GroupSummaryMember } from "@/lib/search-types";
import {
  emitSearchDedupMemberClick,
  emitSearchDedupOpenPanelClick,
} from "@/lib/search/search-telemetry-client";

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
  onMemberClick?: (member: GroupSummaryMember, index: number) => void;
  onOverflowClick?: () => void;
  queryHashPrefix8?: string;
}

export interface GroupDatesPanelProps extends GroupDatesSharedProps {
  panelId: string;
  triggerId?: string;
  onClose?: () => void;
}

type GroupDateEntry = {
  member: GroupSummaryMember;
  shortLabel: string;
  longLabel: string;
};

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

function buildBaseLabels(member: GroupSummaryMember): {
  shortLabel: string;
  longLabel: string;
} {
  const shortStart = formatGroupDate(member.availableFrom, {
    month: "short",
    day: "numeric",
  });
  const longStart = formatGroupDate(member.availableFrom, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (member.availableUntil && member.availableUntil !== member.availableFrom) {
    const shortEnd = formatGroupDate(member.availableUntil, {
      month: "short",
      day: "numeric",
    });
    const longEnd = formatGroupDate(member.availableUntil, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    return {
      shortLabel: `Available ${shortStart} to ${shortEnd}`,
      longLabel: `Available ${longStart} to ${longEnd}`,
    };
  }

  return {
    shortLabel: `Available ${shortStart}`,
    longLabel: `Available ${longStart}`,
  };
}

function buildGroupDateEntries(
  _canonical: GroupDatesCanonical,
  summary: GroupSummary
): GroupDateEntry[] {
  const members = summary.members ?? [];
  if (members.length <= 1) {
    return [];
  }

  const baseEntries = members.map((member) => ({
    member,
    ...buildBaseLabels(member),
  }));
  const duplicateCounts = new Map<string, number>();

  return baseEntries.map((entry) => {
    const duplicateIndex = duplicateCounts.get(entry.shortLabel) ?? 0;
    duplicateCounts.set(entry.shortLabel, duplicateIndex + 1);

    if (duplicateIndex === 0) {
      return entry;
    }

    const suffix =
      entry.member.roomType?.trim() || entry.member.listingId.slice(-4);
    return {
      ...entry,
      shortLabel: `${entry.shortLabel} · ${suffix}`,
      longLabel: `${entry.longLabel} · ${suffix}`,
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
}: Omit<GroupDatesSharedProps, "queryHashPrefix8"> & {
  autoFocusFirstChip?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const firstChipRef = useRef<HTMLButtonElement | null>(null);
  const entries = useMemo(
    () => buildGroupDateEntries(canonical, summary),
    [canonical, summary]
  );
  const groupSize = summary.members?.length ?? 0;

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
          key={`${entry.member.listingId}-${entry.shortLabel}`}
          ref={index === 0 ? firstChipRef : null}
          type="button"
          data-testid="group-dates-chip"
          aria-label={entry.longLabel}
          className="inline-flex min-h-[40px] items-center rounded-full border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-highest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          onClick={() => {
            emitSearchDedupMemberClick({
              groupSize,
              memberIndex: index,
            });
            onMemberClick?.(entry.member, index);
          }}
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
  queryHashPrefix8,
}: GroupDatesPanelProps) {
  useEffect(() => {
    emitSearchDedupOpenPanelClick({
      groupSize: summary.members?.length ?? 0,
      queryHashPrefix8: queryHashPrefix8 ?? "none",
    });
  }, [queryHashPrefix8, summary.members]);

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
