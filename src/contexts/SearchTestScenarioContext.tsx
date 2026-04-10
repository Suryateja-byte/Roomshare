"use client";

import { createContext, useContext } from "react";
import type { SearchScenario } from "@/lib/search/testing/search-scenarios";

const SearchTestScenarioContext = createContext<SearchScenario | null>(null);

export function SearchTestScenarioProvider({
  children,
  scenario,
}: {
  children: React.ReactNode;
  scenario: SearchScenario | null;
}) {
  return (
    <SearchTestScenarioContext.Provider value={scenario}>
      {children}
    </SearchTestScenarioContext.Provider>
  );
}

export function useSearchTestScenario(): SearchScenario | null {
  return useContext(SearchTestScenarioContext);
}
