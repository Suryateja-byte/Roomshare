'use client';

import { useState, useCallback, useRef } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { apiFetch, handleFetchError } from '@/lib/api-client';

interface FavoriteButtonProps {
    listingId: string;
    initialIsSaved?: boolean;
    className?: string;
}

export default function FavoriteButton({ listingId, initialIsSaved = false, className }: FavoriteButtonProps) {
    const [isSaved, setIsSaved] = useState(initialIsSaved);
    const [isLoading, setIsLoading] = useState(false);
    const [animating, setAnimating] = useState(false);
    const isSubmittingRef = useRef(false);
    const router = useRouter();

    // P2-3: Memoize handler to improve INP by preventing function recreation on each render
    const toggleFavorite = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isLoading || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setIsLoading(true);
        // Optimistic update with bounce animation on save
        const previousState = isSaved;
        const willSave = !isSaved;
        setIsSaved(willSave);
        if (willSave) {
            setAnimating(true);
            setTimeout(() => setAnimating(false), 400);
        }

        try {
            const data = await apiFetch<{ saved: boolean }>('/api/favorites', {
                method: 'POST',
                body: JSON.stringify({ listingId }),
            });

            setIsSaved(data.saved);
            router.refresh(); // Refresh server components to update lists if needed
        } catch (error) {
            setIsSaved(previousState); // Revert on error
            handleFetchError(error, 'Failed to update favorite');
        } finally {
            setIsLoading(false);
            isSubmittingRef.current = false;
        }
    }, [isLoading, isSaved, listingId, router]);

    return (
        <button
            onClick={toggleFavorite}
            disabled={isLoading}
            aria-label={isSaved ? "Remove from saved" : "Save listing"}
            aria-pressed={isSaved}
            className={cn(
                "p-2 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white transition-colors shadow-sm group min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2",
                isSaved ? "text-red-500" : "text-zinc-400 hover:text-red-500",
                className
            )}
        >
            <Heart
                className={cn(
                    "w-4 h-4 transition-all duration-300",
                    isSaved ? "fill-current scale-110" : "scale-100",
                    animating && "animate-heart-bounce"
                )}
            />
        </button>
    );
}
