import Link from 'next/link';

export default function ListingNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Listing not found</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">This listing may have been removed or is no longer available.</p>
      <Link href="/search" className="mt-4 text-blue-600 hover:underline">Browse listings</Link>
    </div>
  );
}
