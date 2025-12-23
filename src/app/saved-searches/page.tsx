import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getMySavedSearches } from '@/app/actions/saved-search';
import SavedSearchList from './SavedSearchList';
import { Bookmark } from 'lucide-react';
import Link from 'next/link';
import type { SearchFilters } from '@/lib/search-utils';

export default async function SavedSearchesPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/saved-searches');
    }

    const savedSearches = await getMySavedSearches();

    return (
        <div className="min-h-screen bg-zinc-50 py-12">
            <div className="max-w-3xl mx-auto px-4">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center">
                            <Bookmark className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900">Saved Searches</h1>
                            <p className="text-zinc-500">
                                {savedSearches.length} saved search{savedSearches.length !== 1 ? 'es' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                {savedSearches.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 p-12 text-center">
                        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bookmark className="w-8 h-8 text-zinc-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-900 mb-2">No saved searches yet</h2>
                        <p className="text-zinc-500 mb-6">
                            Save your searches to quickly find listings that match your criteria
                        </p>
                        <Link
                            href="/search"
                            className="inline-flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
                        >
                            Start Searching
                        </Link>
                    </div>
                ) : (
                    <SavedSearchList initialSearches={savedSearches.map(s => ({
                        ...s,
                        filters: s.filters as SearchFilters
                    }))} />
                )}
            </div>
        </div>
    );
}
