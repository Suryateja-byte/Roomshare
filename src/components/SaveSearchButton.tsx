'use client';

import { useEffect, useRef, useState } from 'react';
import { saveSearch } from '@/app/actions/saved-search';
import type { SearchFilters } from '@/lib/search-utils';
import { parseSearchParams, type RawSearchParams } from '@/lib/search-params';
import { Bookmark, Loader2, X, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { FocusTrap } from '@/components/ui/FocusTrap';

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
    const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Get current filters from URL using centralized validation
    const getCurrentFilters = (): SearchFilters => {
        // Build RawSearchParams from URL
        const raw: RawSearchParams = {
            q: searchParams.get('q') ?? undefined,
            minPrice: searchParams.get('minPrice') ?? undefined,
            maxPrice: searchParams.get('maxPrice') ?? undefined,
            amenities: searchParams.getAll('amenities'),
            moveInDate: searchParams.get('moveInDate') ?? undefined,
            leaseDuration: searchParams.get('leaseDuration') ?? undefined,
            houseRules: searchParams.getAll('houseRules'),
            roomType: searchParams.get('roomType') ?? undefined,
            languages: searchParams.getAll('languages'),
            genderPreference: searchParams.get('genderPreference') ?? undefined,
            householdGender: searchParams.get('householdGender') ?? undefined,
            lat: searchParams.get('lat') ?? undefined,
            lng: searchParams.get('lng') ?? undefined,
            minLat: searchParams.get('minLat') ?? undefined,
            maxLat: searchParams.get('maxLat') ?? undefined,
            minLng: searchParams.get('minLng') ?? undefined,
            maxLng: searchParams.get('maxLng') ?? undefined,
            sort: searchParams.get('sort') ?? undefined,
        };

        // Use centralized parser for validation (MAX_SAFE_PRICE, date validation, allowlists, etc.)
        const parsed = parseSearchParams(raw);
        const fp = parsed.filterParams;

        // Convert FilterParams to SearchFilters format
        const filters: SearchFilters = {};
        if (fp.query) filters.query = fp.query;
        if (fp.minPrice !== undefined) filters.minPrice = fp.minPrice;
        if (fp.maxPrice !== undefined) filters.maxPrice = fp.maxPrice;
        if (fp.amenities) filters.amenities = fp.amenities;
        if (fp.moveInDate) filters.moveInDate = fp.moveInDate;
        if (fp.leaseDuration) filters.leaseDuration = fp.leaseDuration;
        if (fp.houseRules) filters.houseRules = fp.houseRules;
        if (fp.roomType) filters.roomType = fp.roomType;
        if (fp.languages) filters.languages = fp.languages;
        if (fp.genderPreference) filters.genderPreference = fp.genderPreference;
        if (fp.householdGender) filters.householdGender = fp.householdGender;
        if (fp.sort) filters.sort = fp.sort;
        // Convert bounds back to flat coordinate fields for SearchFilters
        if (fp.bounds) {
            filters.minLat = fp.bounds.minLat;
            filters.maxLat = fp.bounds.maxLat;
            filters.minLng = fp.bounds.minLng;
            filters.maxLng = fp.bounds.maxLng;
        }

        return filters;
    };

    // Generate a default name based on filters
    const generateDefaultName = (): string => {
        const filters = getCurrentFilters();
        const parts: string[] = [];

        if (filters.query) parts.push(filters.query);
        if (filters.roomType) parts.push(filters.roomType.replace('_', ' '));
        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
            const priceRange = [
                filters.minPrice !== undefined ? `$${filters.minPrice}` : '',
                filters.maxPrice !== undefined ? `$${filters.maxPrice}` : ''
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

            if ("error" in result) {
                setError(result.error ?? 'Failed to save search');
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
                ref={triggerButtonRef}
                onClick={handleOpen}
                className={`inline-flex items-center gap-2 h-11 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap ${className}`}
            >
                <Bookmark className="w-4 h-4" />
                <span className="hidden sm:inline">Save Search</span>
            </button>

            {/* Modal */}
            {isOpen && (
                <FocusTrap active={isOpen} returnFocus={true}>
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/50"
                            onClick={() => setIsOpen(false)}
                            aria-hidden="true"
                        />

                        {/* Modal Content */}
                        <div
                            className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="save-search-dialog-title"
                        >
                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-600"
                                aria-label="Close save search dialog"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 id="save-search-dialog-title" className="text-xl font-bold text-zinc-900 mb-4">Save This Search</h2>

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
                                        aria-describedby={error ? "save-search-error" : undefined}
                                        aria-invalid={!!error}
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
                                            role="switch"
                                            aria-checked={alertEnabled}
                                            aria-label="Email alerts"
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${alertEnabled ? 'bg-zinc-900' : 'bg-zinc-200'
                                                }`}
                                        >
                                            <span
                                                aria-hidden="true"
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
                                    <p id="save-search-error" role="alert" className="text-sm text-red-600">{error}</p>
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
                                        className="flex-1 px-4 py-2.5 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
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
                </FocusTrap>
            )}
        </>
    );
}
