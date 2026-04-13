"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import type { SortOption } from "@/lib/data";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { ArrowUpDown, Check } from "lucide-react";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest First" },
  { value: "rating", label: "Top Rated" },
];

interface SortSelectProps {
  currentSort: SortOption;
}

export default function SortSelect({ currentSort }: SortSelectProps) {
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionContext = useSearchTransitionSafe();
  useBodyScrollLock(mobileOpen);

  // Prevent hydration mismatch from Radix UI generating different IDs on server vs client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape key closes mobile sort sheet
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  // P2-3: Memoize handler to improve INP by preventing function recreation on each render
  const handleSortChange = useCallback(
    (newSort: string) => {
      setDesktopOpen(false);
      const currentQuery = normalizeSearchQuery(
        new URLSearchParams(searchParams.toString())
      );
      const url = buildCanonicalSearchUrl(
        applySearchQueryChange(currentQuery, "sort", {
          sort: newSort === "recommended" ? undefined : (newSort as SortOption),
        })
      );
      if (transitionContext) {
        transitionContext.navigateWithTransition(url, { reason: "sort" });
      } else {
        router.push(url);
      }
      setMobileOpen(false);
    },
    [searchParams, transitionContext, router]
  );

  const currentLabel =
    sortOptions.find((opt) => opt.value === currentSort)?.label ||
    "Recommended";
  const isNonDefault = currentSort !== "recommended";

  // Render placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
        <button
          type="button"
          className="md:hidden flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border border-outline-variant/20 text-sm font-medium text-on-surface-variant"
        >
          <ArrowUpDown className="w-4 h-4" />
          <span className="hidden sm:inline">Sort</span>
        </button>
        <div className="hidden md:flex items-center gap-2">
          <span>Sort by:</span>
          <div className="h-9 min-w-[140px] px-3 py-1.5 text-on-surface font-semibold text-xs flex items-center">
            {currentLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile sort button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={`md:hidden flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border text-sm font-medium transition-colors ${
          isNonDefault
            ? "border-primary bg-primary text-on-primary"
            : "border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high"
        }`}
        aria-label={`Sort: ${currentLabel}`}
      >
        <ArrowUpDown className="w-4 h-4" />
        <span className="hidden sm:inline">Sort</span>
      </button>

      {/* Mobile sort sheet */}
      {mobileOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sort-sheet-title"
            tabIndex={-1}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-on-surface/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            {/* Sheet */}
            <FocusTrap active={mobileOpen}>
              <div className="absolute bottom-0 left-0 right-0 bg-surface-container-lowest rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200">
                <div className="flex justify-center py-3">
                  <div className="w-10 h-1 bg-surface-container-high rounded-full" />
                </div>
                <div className="px-4 pb-2">
                  <h3
                    id="sort-sheet-title"
                    className="text-lg font-semibold text-on-surface"
                  >
                    Sort by
                  </h3>
                </div>
                <div className="px-2 pb-6">
                  {sortOptions.map((option) => {
                    const isActive = option.value === currentSort;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSortChange(option.value)}
                        className={`flex items-center justify-between w-full px-4 py-3.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface-variant hover:bg-surface-canvas"
                        }`}
                      >
                        <span>{option.label}</span>
                        {isActive && (
                          <Check className="w-4 h-4 text-on-surface" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Safe area spacer for phones with home indicator */}
                <div className="h-safe-area-inset-bottom" />
              </div>
            </FocusTrap>
          </div>,
          document.body
        )}

      {/* Desktop sort dropdown */}
      <div className="hidden md:flex items-center gap-2 text-xs font-medium text-on-surface-variant">
        <span>Sort by:</span>
        <Select
          value={currentSort}
          onValueChange={handleSortChange}
          open={desktopOpen}
          onOpenChange={setDesktopOpen}
        >
          <SelectTrigger
            aria-label="Sort by"
            className={`h-9 w-auto min-w-[140px] border-none bg-transparent hover:bg-surface-container-high px-3 py-1.5 font-semibold text-xs focus-visible:ring-2 focus-visible:ring-primary/30 ${
              isNonDefault ? "text-on-surface" : "text-on-surface-variant"
            }`}
          >
            <SelectValue placeholder="Recommended">{currentLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  {option.label}
                  {option.value === currentSort && (
                    <Check className="w-3 h-3" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
