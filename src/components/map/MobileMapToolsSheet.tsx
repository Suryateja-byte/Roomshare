"use client";

import { useId } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Ellipsis, X } from "lucide-react";
import type { POICategory } from "./POILayer";
import {
  getMapToolsActiveCount,
  MapToolsPanelSections,
} from "./MapToolsContent";
import { cn } from "@/lib/utils";

interface MobileMapToolsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePOICategories: Set<POICategory>;
  onTogglePOICategory: (category: POICategory) => void;
  isDropMode: boolean;
  hasPin: boolean;
  onToggleDropMode: () => void;
  onClearPin: () => void;
}

export default function MobileMapToolsSheet({
  open,
  onOpenChange,
  activePOICategories,
  onTogglePOICategory,
  isDropMode,
  hasPin,
  onToggleDropMode,
  onClearPin,
}: MobileMapToolsSheetProps) {
  const contentId = useId();
  const activeToolCount = getMapToolsActiveCount({
    activePOICategories,
    hasPin,
    isDropMode,
  });
  const toolsLabel =
    activeToolCount > 0
      ? `More map tools, ${activeToolCount} active`
      : "More map tools";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-12 w-12 items-center justify-center rounded-full border shadow-ambient backdrop-blur-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
            open
              ? "border-on-surface/20 bg-on-surface text-white"
              : "border-outline-variant/20 bg-surface-container-lowest/95 text-on-surface-variant hover:bg-surface-container-high"
          )}
          aria-label={toolsLabel}
          aria-controls={contentId}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="mobile-map-tools-trigger"
          title="More map tools"
        >
          <Ellipsis className="h-4 w-4" aria-hidden />
          {activeToolCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-on-primary">
              {activeToolCount}
            </span>
          ) : null}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[1300] bg-on-surface/32 backdrop-blur-[8px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="mobile-map-tools-overlay"
        />
        <DialogPrimitive.Content
          id={contentId}
          className="fixed inset-x-0 bottom-0 z-[1305] mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest/98 shadow-ambient-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-6 data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="mobile-map-tools-sheet"
        >
          <div className="px-4 pb-3 pt-3">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-on-surface/14" aria-hidden />

            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-semibold text-on-surface">
                  Map tools
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-on-surface-variant">
                  Quick actions and layers for the map
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                  aria-label="Close map tools"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-1">
            <MapToolsPanelSections
              activePOICategories={activePOICategories}
              onTogglePOICategory={onTogglePOICategory}
              isDropMode={isDropMode}
              hasPin={hasPin}
              onToggleDropMode={onToggleDropMode}
              onClearPin={onClearPin}
              onRequestClose={() => onOpenChange(false)}
              order="actions-first"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
