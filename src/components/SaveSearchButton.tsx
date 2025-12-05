'use client';

import { useState } from 'react';
import { saveSearch } from '@/app/actions/saved-search';
import type { SearchFilters } from '@/lib/search-utils';
import { Bookmark, Loader2, X, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';

interface SaveSearchButtonProps {
    className?: string;
}

type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY';

export default function SaveSearchButton({ className = '' }: SaveSearchButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [alertEnabled, setAlertEnabled] = useState(true);
    const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>('DAILY');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    // Get current filters from URL
    const getCurrentFilters = (): SearchFilters => {
        const filters: SearchFilters = {};

        const q = searchParams.get('q');
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        const amenities = searchParams.get('amenities');
        const moveInDate = searchParams.get('moveInDate');
        const leaseDuration = searchParams.get('leaseDuration');
        const houseRules = searchParams.get('houseRules');
        const roomType = searchParams.get('roomType');

        if (q) filters.query = q;
        if (minPrice) filters.minPrice = parseFloat(minPrice);
        if (maxPrice) filters.maxPrice = parseFloat(maxPrice);
        if (amenities) filters.amenities = amenities.split(',');
        if (moveInDate) filters.moveInDate = moveInDate;
        if (leaseDuration) filters.leaseDuration = leaseDuration;
        if (houseRules) filters.houseRules = houseRules.split(',');
        if (roomType) filters.roomType = roomType;

        return filters;
    };

    // Generate a default name based on filters
    const generateDefaultName = (): string => {
        const filters = getCurrentFilters();
        const parts: string[] = [];

        if (filters.query) parts.push(filters.query);
        if (filters.roomType) parts.push(filters.roomType.replace('_', ' '));
        if (filters.minPrice || filters.maxPrice) {
            const priceRange = [
                filters.minPrice ? `$${filters.minPrice}` : '',
                filters.maxPrice ? `$${filters.maxPrice}` : ''
            ].filter(Boolean).join('-');
            if (priceRange) parts.push(priceRange);
        }

        return parts.length > 0 ? parts.join(' - ') : 'My Search';
    };

    const handleOpen = () => {
        setName(generateDefaultName());
        setError(null);
        setIsOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Please enter a name for this search');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await saveSearch({
                name: name.trim(),
                filters: getCurrentFilters(),
                alertEnabled,
                alertFrequency
            });

            if (result.error) {
                setError(result.error);
            } else {
                setIsOpen(false);
                toast.success('Search saved successfully!');
            }
        } catch (err) {
            setError('Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={handleOpen}
                className={`inline-flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap ${className}`}
            >
                <Bookmark className="w-4 h-4" />
                <span className="hidden sm:inline">Save Search</span>
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-600"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl font-bold text-zinc-900 mb-4">Save This Search</h2>

                        <div className="space-y-4">
                            {/* Search Name */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">
                                    Search Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Downtown apartments under $1500"
                                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                                />
                            </div>

                            {/* Alert Toggle */}
                            <div className="p-4 bg-zinc-50 rounded-xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {alertEnabled ? (
                                            <Bell className="w-5 h-5 text-zinc-600" />
                                        ) : (
                                            <BellOff className="w-5 h-5 text-zinc-400" />
                                        )}
                                        <div>
                                            <p className="font-medium text-zinc-900">Email Alerts</p>
                                            <p className="text-xs text-zinc-500">
                                                Get notified when new listings match
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAlertEnabled(!alertEnabled)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${alertEnabled ? 'bg-zinc-900' : 'bg-zinc-200'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${alertEnabled ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>

                                {/* Alert Frequency */}
                                {alertEnabled && (
                                    <div className="pt-3 border-t border-zinc-200">
                                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                                            Alert Frequency
                                        </label>
                                        <div className="flex gap-2">
                                            {(['INSTANT', 'DAILY', 'WEEKLY'] as const).map((freq) => (
                                                <button
                                                    key={freq}
                                                    type="button"
                                                    onClick={() => setAlertFrequency(freq)}
                                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                        alertFrequency === freq
                                                            ? 'bg-zinc-900 text-white'
                                                            : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                                                    }`}
                                                >
                                                    {freq === 'INSTANT' ? 'Instant' : freq === 'DAILY' ? 'Daily' : 'Weekly'}
                                                </button>
                                            ))}
                                        </div>
                                        {alertFrequency === 'INSTANT' && (
                                            <p className="mt-2 text-xs text-zinc-500">
                                                Get notified immediately when a new listing matches your search
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Error */}
                            {error && (
                                <p className="text-sm text-red-600">{error}</p>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-2.5 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Search'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
