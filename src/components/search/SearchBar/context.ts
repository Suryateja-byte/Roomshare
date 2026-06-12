"use client";

import { createContext, useContext } from "react";
import type { SearchBarFieldId, SearchBarLayout } from "./types";

export interface SearchBarContextValue {
  layout: SearchBarLayout;
  idPrefix: string;
  focusedField: SearchBarFieldId | null;
  hoveredField: SearchBarFieldId | null;
  /** True while any field in the bar has focus (drives the raised-card treatment). */
  engaged: boolean;
  setHoveredField: (field: SearchBarFieldId | null) => void;
  onFieldFocus: (field: SearchBarFieldId) => void;
  onFieldBlur: () => void;
}

export const SearchBarContext = createContext<SearchBarContextValue | null>(
  null
);

export function useSearchBarContext(): SearchBarContextValue {
  const context = useContext(SearchBarContext);
  if (!context) {
    throw new Error("SearchBar components must be rendered inside <SearchBar>");
  }
  return context;
}
