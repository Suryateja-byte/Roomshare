'use client';

import { useState, useEffect } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toggleSaveListing, isListingSaved } from '@/app/actions/saved-listings';

interface SaveListingButtonProps {
    listingId: string;
}

export default function SaveListingButton({ listingId }: SaveListingButtonProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isToggling, setIsToggling] = useState(false);

    useEffect(() => {
        const checkSavedStatus = async () => {
            const result = await isListingSaved(listingId);
            setIsSaved(result.saved);
            setIsLoading(false);
        };
        checkSavedStatus();
    }, [listingId]);

    const handleToggle = async () => {
        setIsToggling(true);
        const result = await toggleSaveListing(listingId);
        if (!result.error) {
            setIsSaved(result.saved);
        }
        setIsToggling(false);
    };

    if (isLoading) {
        return (
            <Button variant="outline" size="icon" className="rounded-full" disabled aria-label="Loading saved status">
                <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
        );
    }

    return (
        <Button
            variant="outline"
            size="icon"
            className={`rounded-full transition-all ${isSaved ? 'bg-red-50 border-red-200 hover:bg-red-100' : ''}`}
            onClick={handleToggle}
            disabled={isToggling}
            aria-label={isSaved ? 'Remove from saved listings' : 'Save listing'}
        >
            {isToggling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Heart
                    className={`w-4 h-4 transition-colors ${isSaved ? 'fill-red-500 text-red-500' : ''}`}
                />
            )}
        </Button>
    );
}
