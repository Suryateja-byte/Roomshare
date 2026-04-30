import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getMySavedSearches } from "@/app/actions/saved-search";
import SavedSearchList from "./SavedSearchList";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import type { SearchFilters } from "@/lib/search-utils";
import { evaluateSavedSearchAlertPaywall } from "@/lib/payments/search-alert-paywall";

export const metadata: Metadata = {
  title: "Saved Searches | RoomShare",
  description:
    "Manage your saved room searches and get notified of new matches.",
  robots: { index: false, follow: false },
};

export default async function SavedSearchesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/saved-searches");
  }

  const [savedSearches, alertPaywallSummary] = await Promise.all([
    getMySavedSearches(),
    evaluateSavedSearchAlertPaywall({ userId: session.user.id }),
  ]);

  return (
    <div className="min-h-svh bg-surface-canvas py-12">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
              <Bookmark className="w-6 h-6 text-on-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-on-surface">
                Saved Searches
              </h1>
              <p className="text-on-surface-variant">
                {savedSearches.length} saved search
                {savedSearches.length !== 1 ? "es" : ""}
              </p>
            </div>
          </div>
        </div>

        {savedSearches.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-12 text-center">
            <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-4">
              <Bookmark className="w-8 h-8 text-on-surface-variant" />
            </div>
            <h2 className="font-display text-xl font-semibold text-on-surface mb-2">
              No saved searches yet
            </h2>
            <p className="text-on-surface-variant mb-6">
              Save your searches to quickly find listings that match your
              criteria
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors"
            >
              Start Searching
            </Link>
          </div>
        ) : (
          <SavedSearchList
            initialSearches={savedSearches.map((s) => ({
              ...s,
              filters: s.filters as SearchFilters,
            }))}
            initialAlertPaywallSummary={alertPaywallSummary}
          />
        )}
      </div>
    </div>
  );
}
