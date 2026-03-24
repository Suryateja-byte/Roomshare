import Link from "next/link";

export default function ListingNotFound() {
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center bg-surface-canvas">
      <h1 className="text-2xl font-bold font-display text-on-surface mb-2">Listing not found</h1>
      <p className="text-on-surface-variant mb-6">
        This listing may have been removed or the link is incorrect.
      </p>
      <Link
        href="/search"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Browse listings
      </Link>
    </section>
  );
}
