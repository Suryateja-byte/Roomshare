import { AlertCircle } from "lucide-react";

interface NearMatchSeparatorProps {
  nearMatchCount: number;
}

/**
 * Visual separator between exact matches and near-match listings.
 * Displays a header explaining that the following listings are
 * slightly outside the user's filter criteria.
 */
export default function NearMatchSeparator({
  nearMatchCount,
}: NearMatchSeparatorProps) {
  return (
    <div
      className="col-span-full flex items-center gap-3 py-4 my-2"
      role="separator"
      aria-label={`${nearMatchCount} near match ${nearMatchCount === 1 ? "listing" : "listings"}`}
    >
      {/* Decorative line */}
      <div className="flex-1 border-t-2 border-dashed border-amber-300" />

      {/* Badge */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-outline-variant/20">
        <AlertCircle className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700">
          {nearMatchCount} near {nearMatchCount === 1 ? "match" : "matches"}
        </span>
      </div>

      {/* Decorative line */}
      <div className="flex-1 border-t-2 border-dashed border-amber-300" />
    </div>
  );
}
