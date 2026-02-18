'use client';

import { useState } from 'react';
import { deleteSavedSearch, toggleSearchAlert } from '@/app/actions/saved-search';
import { buildSearchUrl, type SearchFilters } from '@/lib/search-utils';
import { Bell, BellOff, Trash2, ExternalLink, Loader2, Edit2, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SavedSearch {
    id: string;
    name: string;
    query: string | null;
    filters: SearchFilters;
    alertEnabled: boolean;
    lastAlertAt: Date | null;
    createdAt: Date;
}

interface SavedSearchListProps {
    initialSearches: SavedSearch[];
}

export default function SavedSearchList({ initialSearches }: SavedSearchListProps) {
    const [searches, setSearches] = useState(initialSearches);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const router = useRouter();

    const handleToggleAlert = async (id: string, currentEnabled: boolean) => {
        setLoadingId(id);
        try {
            const result = await toggleSearchAlert(id, !currentEnabled);
            if ('success' in result && result.success) {
                setSearches(prev =>
                    prev.map(s =>
                        s.id === id ? { ...s, alertEnabled: !currentEnabled } : s
                    )
                );
            }
        } catch (error) {
            console.error('Error toggling alert:', error);
        } finally {
            setLoadingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this saved search?')) return;

        setLoadingId(id);
        try {
            const result = await deleteSavedSearch(id);
            if ('success' in result && result.success) {
                setSearches(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('Error deleting search:', error);
        } finally {
            setLoadingId(null);
        }
    };

    const formatFilters = (filters: SearchFilters): string => {
        const parts: string[] = [];

        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
            const range = [
                filters.minPrice !== undefined ? `$${filters.minPrice}` : 'Any',
                filters.maxPrice !== undefined ? `$${filters.maxPrice}` : 'Any'
            ].join(' - ');
            parts.push(`Price: ${range}`);
        }

        if (filters.roomType) {
            parts.push(`Type: ${filters.roomType.replace('_', ' ')}`);
        }

        if (filters.amenities?.length) {
            parts.push(`${filters.amenities.length} amenities`);
        }

        if (filters.leaseDuration) {
            parts.push(`Lease: ${filters.leaseDuration}`);
        }

        return parts.join(' | ') || 'No filters';
    };

    return (
        <div className="space-y-4">
            {searches.map((search) => (
                <div
                    key={search.id}
                    className="bg-white rounded-xl border border-zinc-100 overflow-hidden hover:border-zinc-200 transition-colors"
                >
                    <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-zinc-900 truncate">
                                    {search.name}
                                </h3>
                                <p className="text-sm text-zinc-500 mt-1">
                                    {formatFilters(search.filters as SearchFilters)}
                                </p>
                                {search.query && (
                                    <p className="text-sm text-zinc-400 mt-1">
                                        Search: "{search.query}"
                                    </p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                {/* Alert Toggle */}
                                <button
                                    onClick={() => handleToggleAlert(search.id, search.alertEnabled)}
                                    disabled={loadingId === search.id}
                                    className={`p-2 rounded-lg transition-colors ${search.alertEnabled
                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                            : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                                        }`}
                                    title={search.alertEnabled ? 'Disable alerts' : 'Enable alerts'}
                                >
                                    {loadingId === search.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : search.alertEnabled ? (
                                        <Bell className="w-4 h-4" />
                                    ) : (
                                        <BellOff className="w-4 h-4" />
                                    )}
                                </button>

                                {/* Delete */}
                                <button
                                    onClick={() => handleDelete(search.id)}
                                    disabled={loadingId === search.id}
                                    className="p-2 rounded-lg bg-zinc-100 text-zinc-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                                    title="Delete search"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>

                                {/* Open Search */}
                                <Link
                                    href={buildSearchUrl(search.filters as SearchFilters)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
                                >
                                    View
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 text-xs text-zinc-400">
                            <span>
                                Created {new Date(search.createdAt).toLocaleDateString()}
                            </span>
                            {search.alertEnabled && (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                    <Bell className="w-3 h-3" />
                                    Alerts enabled
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
