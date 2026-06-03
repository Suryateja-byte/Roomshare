interface SearchResultsMobileHeadingProps {
  total: number | null;
  locationLabel?: string;
}

export default function SearchResultsMobileHeading({
  total,
  locationLabel,
}: SearchResultsMobileHeadingProps) {
  return (
    <h1
      id="search-results-heading"
      tabIndex={-1}
      className="sr-only md:hidden"
    >
      {total === null ? "100+" : total} {total === 1 ? "place" : "places"}
      {locationLabel ? ` in ${locationLabel}` : ""}
    </h1>
  );
}
