"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SearchListResultsContextValue {
  ids: string[] | null;
  setListResultIds: (ids: string[] | null) => void;
}

const SearchListResultsContext =
  createContext<SearchListResultsContextValue | null>(null);

const FALLBACK_CONTEXT: SearchListResultsContextValue = {
  ids: null,
  setListResultIds: () => {},
};

function sameIds(left: string[] | null, right: string[] | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

export function SearchListResultsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [ids, setIds] = useState<string[] | null>(null);

  const setListResultIds = useCallback((nextIds: string[] | null) => {
    setIds((current) => {
      if (sameIds(current, nextIds)) return current;
      return nextIds ? [...nextIds] : null;
    });
  }, []);

  const value = useMemo<SearchListResultsContextValue>(
    () => ({ ids, setListResultIds }),
    [ids, setListResultIds]
  );

  return (
    <SearchListResultsContext.Provider value={value}>
      {children}
    </SearchListResultsContext.Provider>
  );
}

export function useSearchListResultIds(): string[] | null {
  return (useContext(SearchListResultsContext) ?? FALLBACK_CONTEXT).ids;
}

export function useSearchListResultsActions(): Pick<
  SearchListResultsContextValue,
  "setListResultIds"
> {
  return useContext(SearchListResultsContext) ?? FALLBACK_CONTEXT;
}
