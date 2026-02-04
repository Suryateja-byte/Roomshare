"use client";

import { useState, useEffect } from "react";

/**
 * Hook to detect if a media query matches.
 * Returns undefined during SSR/hydration to avoid mismatch,
 * then resolves to true/false on the client.
 *
 * @param query - CSS media query string (e.g., "(min-width: 768px)")
 * @returns boolean | undefined - undefined during SSR, true/false after hydration
 */
export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
