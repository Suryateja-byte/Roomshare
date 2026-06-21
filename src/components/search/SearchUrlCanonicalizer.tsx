"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { detectLegacyUrlAliases } from "@/lib/search-params";
import {
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import { emitSearchClientMetric } from "@/lib/search/search-telemetry-client";

export function SearchUrlCanonicalizer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const legacyAliases = detectLegacyUrlAliases(
      new URLSearchParams(searchParamsString)
    );
    for (const alias of legacyAliases) {
      emitSearchClientMetric({
        metric: "cfm.search.legacy_url_count",
        alias,
        surface: "spa",
      });
    }

    const currentUrl = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
    // CFM-604: canonical-on-write guarantee — canonical rewrites stay on the shared builder path.
    // #24: Strip pagination tokens (cursor/page) from the shareable URL — "Load more" state
    // is ephemeral client state and must never persist in a copy/bookmarkable URL.
    const canonicalUrl = buildCanonicalSearchUrl(
      normalizeSearchQuery(new URLSearchParams(searchParamsString)),
      { includePagination: false }
    );
    if (canonicalUrl === currentUrl) {
      return;
    }

    window.history.replaceState(null, "", canonicalUrl);
  }, [pathname, searchParamsString]);

  return null;
}

export default SearchUrlCanonicalizer;
