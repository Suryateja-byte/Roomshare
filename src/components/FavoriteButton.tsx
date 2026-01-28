'use client';

import { useState, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
    listingId: string;
    initialIsSaved?: boolean;
    className?: string;
}

export default function FavoriteButton({ listingId, initialIsSaved = false, className }: FavoriteButtonProps) {
    const [isSaved, setIsSaved] = useState(initialIsSaved);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // P2-3: Memoize handler to improve INP by preventing function recreation on each render
    const toggleFavorite = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isLoading) return;

        setIsLoading(true);
        // Optimistic update
        const previousState = isSaved;
        setIsSaved(!isSaved);

        try {
            const response = await fetch('/api/favorites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ listingId }),
            });

            if (response.status === 401) {
                // Redirect to login if unauthorized
                router.push('/login');
                setIsSaved(previousState); // Revert
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to toggle favorite');
            }

            const data = await response.json();
            setIsSaved(data.saved);
            router.refresh(); // Refresh server components to update lists if needed
        } catch (error) {
            console.error('Error toggling favorite:', error);
            setIsSaved(previousState); // Revert on error
        } finally {
            setIsLoading(false);
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
                    isSaved ? "fill-current scale-110" : "scale-100"
                )}
            />
        </button>
    );
}
