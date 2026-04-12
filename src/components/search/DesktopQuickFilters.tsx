"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceRangeFilter } from "@/components/search/PriceRangeFilter";
import {
  QUICK_FILTER_ACTIVE_BADGE_CLASSNAME,
  QUICK_FILTER_ACTIVE_CLASSNAME,
  QUICK_FILTER_INACTIVE_CLASSNAME,
} from "@/components/search/quickFilterStyles";
import { VALID_LEASE_DURATIONS, VALID_ROOM_TYPES } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import type { PriceHistogramBucket } from "@/app/api/search/facets/route";

export type QuickFilterKey =
  | "price"
  | "moveInDate"
  | "roomType"
  | "leaseDuration";

interface DesktopQuickFiltersProps {
  disabled: boolean;
  hasMounted: boolean;
  activeCount: number;
  isAdvancedFiltersOpen: boolean;
  openQuickFilter: QuickFilterKey | null;
  onQuickFilterOpenChange: (key: QuickFilterKey, open: boolean) => void;
  onOpenAdvancedFilters: () => void;
  priceLabel: string;
  moveInLabel: string;
  roomTypeLabel: string;
  leaseDurationLabel: string;
  isPriceActive: boolean;
  isMoveInActive: boolean;
  isRoomTypeActive: boolean;
  isLeaseDurationActive: boolean;
  draftMinPrice?: number;
  draftMaxPrice?: number;
  priceAbsoluteMin: number;
  priceAbsoluteMax: number;
  priceHistogram: PriceHistogramBucket[] | null;
  priceApplyLabel: string;
  isPriceApplyLoading: boolean;
  isPriceApplyDisabled: boolean;
  onPriceDraftChange: (min: number, max: number) => void;
  onPriceDraftClear: () => void;
  onPriceApply: () => void;
  moveInDateValue: string;
  minMoveInDate: string;
  onMoveInSelect: (value: string) => void;
  onMoveInClear: () => void;
  roomTypeValue: string;
  roomTypeCounts?: Record<string, number>;
  onRoomTypeSelect: (value: string) => void;
  leaseDurationValue: string;
  onLeaseDurationSelect: (value: string) => void;
}

const triggerClassName =
  "flex items-center gap-1 px-4 py-2.5 min-h-[44px] rounded-full text-sm whitespace-nowrap transition-colors shrink-0 border";

const popoverContentClassName =
  "z-[1200] w-[min(360px,calc(100vw-32px))] rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-lowest/98 p-4 shadow-ambient backdrop-blur-[20px] outline-none";

interface QuickFilterTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label: string;
  active: boolean;
  open: boolean;
  testId: string;
}

const QuickFilterTrigger = forwardRef<
  HTMLButtonElement,
  QuickFilterTriggerProps
>(({ label, active, open, testId, className, ...buttonProps }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      {...buttonProps}
      data-testid={testId}
      className={cn(
        triggerClassName,
        active || open
          ? cn(QUICK_FILTER_ACTIVE_CLASSNAME, "font-medium")
          : QUICK_FILTER_INACTIVE_CLASSNAME,
        className
      )}
    >
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
    </button>
  );
});

QuickFilterTrigger.displayName = "QuickFilterTrigger";

function FilterOptionButton({
  label,
  selected,
  disabled,
  count,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        selected
          ? "bg-primary/10 text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container-high",
        disabled && !selected && "cursor-not-allowed opacity-40"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{label}</span>
        {count !== undefined && !selected ? (
          <span className="text-xs text-on-surface-variant">({count})</span>
        ) : null}
      </span>
      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
    </button>
  );
}

export function DesktopQuickFilters({
  disabled,
  hasMounted,
  activeCount,
  isAdvancedFiltersOpen,
  openQuickFilter,
  onQuickFilterOpenChange,
  onOpenAdvancedFilters,
  priceLabel,
  moveInLabel,
  roomTypeLabel,
  leaseDurationLabel,
  isPriceActive,
  isMoveInActive,
  isRoomTypeActive,
  isLeaseDurationActive,
  draftMinPrice,
  draftMaxPrice,
  priceAbsoluteMin,
  priceAbsoluteMax,
  priceHistogram,
  priceApplyLabel,
  isPriceApplyLoading,
  isPriceApplyDisabled,
  onPriceDraftChange,
  onPriceDraftClear,
  onPriceApply,
  moveInDateValue,
  minMoveInDate,
  onMoveInSelect,
  onMoveInClear,
  roomTypeValue,
  roomTypeCounts,
  onRoomTypeSelect,
  leaseDurationValue,
  onLeaseDurationSelect,
}: DesktopQuickFiltersProps) {
  return (
    <>
      <Popover.Root
        open={openQuickFilter === "price"}
        onOpenChange={(open) => onQuickFilterOpenChange("price", open)}
      >
        <Popover.Trigger asChild>
          <QuickFilterTrigger
            label={priceLabel}
            active={isPriceActive}
            open={openQuickFilter === "price"}
            disabled={disabled}
            testId="quick-filter-price"
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className={popoverContentClassName}
            data-testid="quick-filter-price-popover"
          >
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Price</h3>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Narrow results by your monthly budget.
                </p>
              </div>

              <PriceRangeFilter
                minPrice={draftMinPrice ?? priceAbsoluteMin}
                maxPrice={draftMaxPrice ?? priceAbsoluteMax}
                absoluteMin={priceAbsoluteMin}
                absoluteMax={priceAbsoluteMax}
                histogram={priceHistogram}
                onChange={onPriceDraftChange}
              />

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onPriceDraftClear}
                  className="rounded-xl"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  onClick={onPriceApply}
                  disabled={isPriceApplyDisabled}
                  className="min-w-[150px] rounded-xl"
                  data-testid="quick-filter-price-apply"
                >
                  {isPriceApplyLoading ? "Updating..." : priceApplyLabel}
                </Button>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root
        open={openQuickFilter === "moveInDate"}
        onOpenChange={(open) => onQuickFilterOpenChange("moveInDate", open)}
      >
        <Popover.Trigger asChild>
          <QuickFilterTrigger
            label={moveInLabel}
            active={isMoveInActive}
            open={openQuickFilter === "moveInDate"}
            disabled={disabled}
            testId="quick-filter-move-in"
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className={cn(popoverContentClassName, "w-[320px]")}
            data-testid="quick-filter-move-in-popover"
          >
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">
                  Move-in date
                </h3>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Choose the earliest date that works for you.
                </p>
              </div>

              <Input
                type="date"
                min={minMoveInDate}
                value={moveInDateValue}
                onChange={(event) => onMoveInSelect(event.target.value)}
                aria-label="Move-in date"
                className="h-11"
              />

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onMoveInClear}
                  className="rounded-xl px-0 text-on-surface-variant hover:bg-transparent hover:text-on-surface"
                >
                  Clear
                </Button>
                <p className="text-xs text-on-surface-variant">
                  Applies as soon as you choose a date.
                </p>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root
        open={openQuickFilter === "roomType"}
        onOpenChange={(open) => onQuickFilterOpenChange("roomType", open)}
      >
        <Popover.Trigger asChild>
          <QuickFilterTrigger
            label={roomTypeLabel}
            active={isRoomTypeActive}
            open={openQuickFilter === "roomType"}
            disabled={disabled}
            testId="quick-filter-room-type"
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className={cn(popoverContentClassName, "w-[300px] p-2")}
            data-testid="quick-filter-room-type-popover"
          >
            <div className="space-y-1">
              <FilterOptionButton
                label="Any"
                selected={!roomTypeValue}
                onClick={() => onRoomTypeSelect("any")}
              />
              {VALID_ROOM_TYPES.map((option) => {
                const count = roomTypeCounts?.[option];
                const isZero = count === 0;
                return (
                  <FilterOptionButton
                    key={option}
                    label={option}
                    selected={roomTypeValue === option}
                    disabled={isZero && roomTypeValue !== option}
                    count={count}
                    onClick={() => onRoomTypeSelect(option)}
                  />
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root
        open={openQuickFilter === "leaseDuration"}
        onOpenChange={(open) => onQuickFilterOpenChange("leaseDuration", open)}
      >
        <Popover.Trigger asChild>
          <QuickFilterTrigger
            label={leaseDurationLabel}
            active={isLeaseDurationActive}
            open={openQuickFilter === "leaseDuration"}
            disabled={disabled}
            testId="quick-filter-duration"
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className={cn(popoverContentClassName, "w-[280px] p-2")}
            data-testid="quick-filter-duration-popover"
          >
            <div className="space-y-1">
              <FilterOptionButton
                label="Any"
                selected={!leaseDurationValue}
                onClick={() => onLeaseDurationSelect("any")}
              />
              {VALID_LEASE_DURATIONS.map((option) => (
                <FilterOptionButton
                  key={option}
                  label={option}
                  selected={leaseDurationValue === option}
                  onClick={() => onLeaseDurationSelect(option)}
                />
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        onClick={onOpenAdvancedFilters}
        disabled={disabled}
        aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
        aria-expanded={isAdvancedFiltersOpen ? "true" : "false"}
        aria-controls="search-filters"
        aria-haspopup="dialog"
        data-hydrated={hasMounted || undefined}
        data-testid="quick-filter-more-filters"
        className={cn(
          "flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 border",
          activeCount > 0
            ? QUICK_FILTER_ACTIVE_CLASSNAME
            : QUICK_FILTER_INACTIVE_CLASSNAME
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span
            className={cn(
              "ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
              QUICK_FILTER_ACTIVE_BADGE_CLASSNAME
            )}
          >
            {activeCount}
          </span>
        ) : null}
      </button>
    </>
  );
}

export default DesktopQuickFilters;
