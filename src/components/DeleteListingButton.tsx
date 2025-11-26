'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function DeleteListingButton({ listingId }: { listingId: string }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/listings/${listingId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                router.push('/search');
                router.refresh();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete listing');
                setIsDeleting(false);
                setShowConfirm(false);
            }
        } catch (error) {
            console.error('Error deleting listing:', error);
            alert('Failed to delete listing');
            setIsDeleting(false);
            setShowConfirm(false);
        }
    };

    if (!showConfirm) {
        return (
            <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowConfirm(true)}
            >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Listing
            </Button>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-sm text-center text-muted-foreground mb-2">
                Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowConfirm(false)}
                    disabled={isDeleting}
                >
                    Cancel
                </Button>
                <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDelete}
                    disabled={isDeleting}
                >
                    {isDeleting ? 'Deleting...' : 'Confirm'}
                </Button>
            </div>
        </div>
    );
}
