"use client";

import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSearchBarContext } from "./context";

interface SearchBarSubmitProps {
  isSearching: boolean;
  disabled?: boolean;
}

/**
 * The terracotta search orb. At rest (row layout, md+) it is a 52px icon
 * circle; while the bar is engaged it morphs open to icon + "Search".
 */
export function SearchBarSubmit({ isSearching, disabled }: SearchBarSubmitProps) {
  const { layout, engaged } = useSearchBarContext();
  const isRow = layout === "row";

  return (
    <Button
      type="submit"
      disabled={disabled || isSearching}
      aria-label={isSearching ? "Searching" : "Search"}
      aria-busy={isSearching}
      className={cn(
        "shrink-0 rounded-full bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] text-on-primary",
        "shadow-[0_16px_34px_-16px_rgba(154,64,39,0.72)]",
        "transition-all duration-300 ease-[var(--ease-editorial)] hover:brightness-105 active:scale-[0.97] motion-reduce:transition-none",
        isRow
          ? "h-12 min-h-[48px] w-full flex-1 gap-2 md:h-[52px] md:min-h-0 md:w-auto md:min-w-[52px] md:flex-none md:gap-0 md:px-[15px]"
          : "h-12 w-full gap-2.5"
      )}
    >
      {isSearching ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Search className="h-5 w-5" strokeWidth={2.5} />
      )}
      <span
        className={cn(
          "font-semibold",
          isRow &&
            cn(
              "md:overflow-hidden md:whitespace-nowrap md:transition-[max-width,opacity,margin-left] md:duration-300 md:ease-[var(--ease-editorial)] motion-reduce:md:transition-none",
              engaged
                ? "md:ml-1.5 md:max-w-[90px] md:opacity-100"
                : "md:ml-0 md:max-w-0 md:opacity-0"
            )
        )}
      >
        Search
      </span>
    </Button>
  );
}
