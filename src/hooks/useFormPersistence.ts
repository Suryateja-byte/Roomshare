'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface PersistedData<T> {
    data: T;
    savedAt: number;
}

interface UseFormPersistenceOptions {
    key: string;
    expirationMs?: number; // Default: 24 hours
    debounceMs?: number; // Default: 500ms
}

interface UseFormPersistenceResult<T> {
    persistedData: T | null;
    hasDraft: boolean;
    savedAt: Date | null;
    saveData: (data: T) => void;
    cancelSave: () => void;
    clearPersistedData: () => void;
    isHydrated: boolean;
}

const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Custom hook for persisting form data to localStorage with expiration.
 *
 * Features:
 * - Debounced auto-save to prevent excessive writes
 * - 24-hour expiration (configurable)
 * - SSR/hydration safe
 * - Handles complex objects with JSON serialization
 *
 * @param options - Configuration options
 * @returns Object with persisted data and control functions
 */
export function useFormPersistence<T>(
    options: UseFormPersistenceOptions
): UseFormPersistenceResult<T> {
    const { key, expirationMs = DEFAULT_EXPIRATION_MS, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

    const [persistedData, setPersistedData] = useState<T | null>(null);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const initialLoadDone = useRef(false);

    // Load persisted data on mount (client-side only)
    useEffect(() => {
        if (initialLoadDone.current) return;
        initialLoadDone.current = true;

        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                setIsHydrated(true);
                return;
            }

            const parsed: PersistedData<T> = JSON.parse(stored);
            const now = Date.now();

            // Check expiration
            if (now - parsed.savedAt > expirationMs) {
                // Data expired, clear it
                localStorage.removeItem(key);
                setIsHydrated(true);
                return;
            }

            // Data is valid
            setPersistedData(parsed.data);
            setSavedAt(new Date(parsed.savedAt));
            setIsHydrated(true);
        } catch (error) {
            console.error('Error loading persisted form data:', error);
            localStorage.removeItem(key);
            setIsHydrated(true);
        }
    }, [key, expirationMs]);

    // Debounced save function
    const debouncedSave = useDebouncedCallback((data: T) => {
        try {
            const persistData: PersistedData<T> = {
                data,
                savedAt: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(persistData));
            setSavedAt(new Date(persistData.savedAt));
            setPersistedData(data);
        } catch (error) {
            console.error('Error saving form data:', error);
        }
    }, debounceMs);

    // Save data with debouncing
    const saveData = useCallback((data: T) => {
        debouncedSave(data);
    }, [debouncedSave]);

    // Clear persisted data (call on successful submission)
    const clearPersistedData = useCallback(() => {
        try {
            localStorage.removeItem(key);
            setPersistedData(null);
            setSavedAt(null);
        } catch (error) {
            console.error('Error clearing persisted data:', error);
        }
    }, [key]);

    // Cancel any pending debounced save (call before clearPersistedData on submit)
    const cancelSave = useCallback(() => {
        debouncedSave.cancel();
    }, [debouncedSave]);

    return {
        persistedData,
        hasDraft: persistedData !== null,
        savedAt,
        saveData,
        cancelSave,
        clearPersistedData,
        isHydrated
    };
}

/**
 * Helper function to format the "saved X ago" time
 */
export function formatTimeSince(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) {
        return 'just now';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}
