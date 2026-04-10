"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";

export function SearchUrlCanonicalizer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const currentUrl = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
    const canonicalUrl = buildCanonicalSearchUrl(
      normalizeSearchQuery(new URLSearchParams(searchParamsString))
    );
    if (canonicalUrl === currentUrl) {
      return;
    }

    router.replace(canonicalUrl, {
      scroll: false,
    });
  }, [pathname, router, searchParamsString]);

  return null;
}

export default SearchUrlCanonicalizer;
