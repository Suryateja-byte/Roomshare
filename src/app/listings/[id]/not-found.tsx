import Link from "next/link";

export default function ListingNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 bg-surface-canvas" data-testid="not-found">
      <h1 className="text-2xl font-bold font-display text-on-surface">
        Listing not found
      </h1>
      <p className="mt-2 text-on-surface-variant">
        This listing may have been removed or is no longer available.
      </p>
      <Link href="/search" className="mt-4 text-primary hover:underline">
        Browse listings
      </Link>
    </div>
  );
}
