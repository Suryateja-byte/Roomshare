"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { emitSearchDedupOpenPanelClick } from "@/lib/search/search-telemetry-client";
import type { GroupSummary } from "@/lib/search-types";
import { GroupDatesActionList, type GroupDatesSharedProps } from "./GroupDatesPanel";

interface GroupDatesModalProps {
  canonical: GroupDatesSharedProps["canonical"];
  summary: GroupSummary;
  open: boolean;
  panelId: string;
  onClose: () => void;
  onMemberClick?: (memberId: string, index: number) => void;
  onOverflowClick?: () => void;
  queryHashPrefix8?: string;
}

function formatTitle(count: number): string {
  return `${count} other move-in date${count === 1 ? "" : "s"} available`;
}

export default function GroupDatesModal({
  canonical,
  summary,
  open,
  panelId,
  onClose,
  onMemberClick,
  onOverflowClick,
  queryHashPrefix8,
}: GroupDatesModalProps) {
  useEffect(() => {
    if (!open) return;
    emitSearchDedupOpenPanelClick({
      groupSize: summary.siblingIds.length + 1,
      queryHashPrefix8: queryHashPrefix8 ?? "none",
    });
  }, [open, queryHashPrefix8, summary.siblingIds.length]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        id={panelId}
        data-testid="group-dates-modal"
        aria-describedby={undefined}
        className="z-[1301] max-w-[min(92vw,28rem)] gap-5 rounded-3xl border border-outline-variant/20 p-5 sm:p-6 [&>button.absolute]:hidden"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DialogClose
          className="absolute right-4 top-4 inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
        >
          Close
        </DialogClose>
        <DialogHeader className="pr-14 text-left">
          <DialogTitle className="text-base font-semibold text-on-surface sm:text-lg">
            {formatTitle(summary.siblingIds.length)}
          </DialogTitle>
        </DialogHeader>
        <GroupDatesActionList
          canonical={canonical}
          summary={summary}
          onMemberClick={onMemberClick}
          onOverflowClick={onOverflowClick}
          onClose={onClose}
          autoFocusFirstChip
          className="pt-1"
        />
      </DialogContent>
    </Dialog>
  );
}
