"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SearchBar,
  SearchBarScrim,
  SearchBarSummary,
  useSearchBarState,
  useSearchSubmit,
  type SearchBarFieldId,
} from "@/components/search/SearchBar";
import { validateMoveInDate } from "@/lib/search/search-dates";

export interface DesktopHeaderSearchHandle {
  openAndFocus: (field?: "where" | "vibe" | "what" | "budget") => void;
}

interface DesktopHeaderSearchProps {
  collapsed: boolean;
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
 * Search-page header search: the shared SearchBar pill, plus the header-only
 * chrome — a same-height collapsed summary with segment deep-links, a page
 * scrim while editing from the collapsed state, and outside-click/Escape
 * collapse with Esc layering (an open autocomplete popup closes first).
 */
export const DesktopHeaderSearch = forwardRef<
  DesktopHeaderSearchHandle,
  DesktopHeaderSearchProps
>(function DesktopHeaderSearch({ collapsed }, ref) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditingCollapsedState, setIsEditingCollapsedState] = useState(false);

  const state = useSearchBarState();
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const { handleSubmit, isSearching, isResolvingTypedLocation } =
    useSearchSubmit({
      state,
      onBeforeNavigate: () => {
        if (collapsedRef.current) {
          setIsEditingCollapsedState(false);
        }
      },
    });

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

  useEffect(() => {
    if (!collapsed) {
      setIsEditingCollapsedState(false);
    }
  }, [collapsed]);

  const collapseEditor = useCallback(() => {
    if (!collapsedRef.current) return;
    state.resetFromUrl();
    setIsEditingCollapsedState(false);
    // Return focus to the summary pill so keyboard users aren't dropped.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        containerRef.current
          ?.querySelector<HTMLElement>('[aria-label="Expand search form"]')
          ?.focus();
      });
    });
  }, [state]);

  useEffect(() => {
    if (!collapsed || !isEditingCollapsedState) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-location-search-popup='true']")) {
        return;
      }
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        collapseEditor();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Esc layering: a visible autocomplete popup consumes the first Escape;
      // only a second one collapses the editor.
      if (document.querySelector("[data-location-search-popup='true']")) {
        return;
      }
      collapseEditor();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [collapseEditor, collapsed, isEditingCollapsedState]);

  const openAndFocus = useCallback(
    (field: "where" | "vibe" | "what" | "budget" = "where") => {
      setIsEditingCollapsedState(true);
      const resolved: SearchBarFieldId = field === "vibe" ? "what" : field;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusField(resolved));
      });
    },
    []
  );

  useImperativeHandle(ref, () => ({ openAndFocus }), [openAndFocus]);

  const isInlineEditorVisible = !collapsed || isEditingCollapsedState;
  const scrimVisible = collapsed && isEditingCollapsedState;

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[1120px]">
      <SearchBarScrim visible={scrimVisible} onDismiss={collapseEditor} />
      {isInlineEditorVisible ? (
        <SearchBar
          state={state}
          onSubmit={handleSubmit}
          isSearching={isSearching}
          submitDisabled={isResolvingTypedLocation}
          formTestId="desktop-header-search-form"
        />
      ) : (
        <SearchBarSummary
          testId="desktop-header-search-summary"
          semanticSearchEnabled={state.semanticSearchEnabled}
          onSegmentClick={openAndFocus}
        />
      )}
    </div>
  );
});

export default DesktopHeaderSearch;
