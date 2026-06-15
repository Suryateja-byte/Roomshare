"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SearchBar,
  useSearchBarState,
  useSearchSubmit,
  type SearchBarFieldId,
} from "@/components/search/SearchBar";
import { validateMoveInDate } from "@/lib/search/search-dates";

export interface DesktopHeaderSearchHandle {
  openAndFocus: (field?: "where" | "vibe" | "what" | "budget") => void;
}

const FIELD_INPUT_IDS: Record<SearchBarFieldId, string> = {
  where: "search-location",
  what: "search-what",
  budget: "search-budget-min",
};

function focusField(field: SearchBarFieldId) {
  const element =
    document.getElementById(FIELD_INPUT_IDS[field]) ??
    // The What field is env-gated; fall back to the location input.
    document.getElementById(FIELD_INPUT_IDS.where);
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

/**
 * Search-page header search: the shared SearchBar pill, always rendered in its
 * full editable form (no scroll collapse). Exposes `openAndFocus` so the
 * header's ⌘K shortcut can jump straight to a specific field.
 */
export const DesktopHeaderSearch = forwardRef<DesktopHeaderSearchHandle>(
  function DesktopHeaderSearch(_props, ref) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const searchParamsString = searchParams.toString();

    const state = useSearchBarState();

    const { handleSubmit, isSearching, isResolvingTypedLocation } =
      useSearchSubmit({ state });

    // Mount-time scrub of an invalid moveInDate in the URL.
    useEffect(() => {
      const rawMoveInDate = searchParams.get("moveInDate");
      const validated = validateMoveInDate(rawMoveInDate);

      if (rawMoveInDate && !validated) {
        const params = new URLSearchParams(searchParamsString);
        params.delete("moveInDate");
        const qs = params.toString();
        router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, {
          scroll: false,
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openAndFocus = useCallback(
      (field: "where" | "vibe" | "what" | "budget" = "where") => {
        const resolved: SearchBarFieldId = field === "vibe" ? "what" : field;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => focusField(resolved));
        });
      },
      []
    );

    useImperativeHandle(ref, () => ({ openAndFocus }), [openAndFocus]);

    return (
      <div className="mx-auto w-full max-w-[1120px]">
        <SearchBar
          state={state}
          onSubmit={handleSubmit}
          isSearching={isSearching}
          submitDisabled={isResolvingTypedLocation}
          formTestId="desktop-header-search-form"
        />
      </div>
    );
  }
);

export default DesktopHeaderSearch;
