"use client";

import Link from "next/link";

const SUGGESTED_SEARCHES = [
  {
    label: "San Francisco",
    href: "/search?q=San+Francisco",
  },
  {
    label: "San Jose",
    href: "/search?q=San+Jose",
  },
  {
    label: "Fremont",
    href: "/search?q=Fremont",
  },
  {
    label: "Sunnyvale",
    href: "/search?q=Sunnyvale",
  },
] as const;

interface SuggestedSearchesProps {
  className?: string;
}

export default function SuggestedSearches({
  className = "",
}: SuggestedSearchesProps) {
  return (
    <section
      className={`rounded-3xl border border-outline-variant/15 bg-surface px-5 py-5 shadow-sm ${className}`.trim()}
      data-testid="suggested-searches"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Start with a popular area
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_SEARCHES.map((search) => (
          <Link
            key={search.label}
            href={search.href}
            className="inline-flex min-h-11 items-center rounded-full border border-outline-variant/20 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-outline-variant/40 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {search.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
