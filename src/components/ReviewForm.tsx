'use client';

import { useState } from 'react';
import { Star, LogIn, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import CharacterCounter from '@/components/CharacterCounter';

const COMMENT_MAX_LENGTH = 500;

interface ReviewFormProps {
    listingId?: string;
    targetUserId?: string;
    isLoggedIn?: boolean;
    onSuccess?: () => void;
}

export default function ReviewForm({ listingId, targetUserId, isLoggedIn = false, onSuccess }: ReviewFormProps) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [hoveredRating, setHoveredRating] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Defense in depth: check auth even though parent should guard
        if (!isLoggedIn) {
            toast.error('Please sign in to submit a review');
            return;
        }

        if (rating === 0) {
            setError('Please select a rating');
            return;
        }
        if (!comment.trim()) {
            setError('Please write a comment');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    listingId,
                    targetUserId,
                    rating,
                    comment
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to submit review');
            }

            // Success! Show feedback
            setIsSubmitted(true);
            toast.success('Review submitted successfully!', {
                description: 'Thank you for sharing your experience.',
                icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
            });

            setRating(0);
            setComment('');
            router.refresh();
            if (onSuccess) onSuccess();

            // Reset submitted state after animation
            setTimeout(() => setIsSubmitted(false), 3000);
        } catch (err: any) {
            setError(err.message);
            toast.error('Failed to submit review', {
                description: err.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show login prompt for logged-out users
    if (!isLoggedIn) {
        return (
            <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="text-center py-4">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                        <LogIn className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg text-zinc-900 dark:text-white mb-2">
                        Sign in to leave a review
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                        Share your experience with others
                    </p>
                    <Link href="/login">
                        <Button className="w-full sm:w-auto">
                            <LogIn className="w-4 h-4 mr-2" />
                            Sign in to review
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
            <h3 className="font-semibold text-lg text-zinc-900 dark:text-white">Write a Review</h3>

            {/* Success state */}
            {isSubmitted && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <span>Your review has been submitted!</span>
                </div>
            )}

            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        className="focus:outline-none transition-transform hover:scale-110"
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(star)}
                    >
                        <Star
                            className={cn(
                                "w-6 h-6",
                                (hoveredRating ? star <= hoveredRating : star <= rating)
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-zinc-300 dark:text-zinc-600"
                            )}
                        />
                    </button>
                ))}
                {rating > 0 && (
                    <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400 self-center">
                        {rating === 1 && 'Poor'}
                        {rating === 2 && 'Fair'}
                        {rating === 3 && 'Good'}
                        {rating === 4 && 'Very Good'}
                        {rating === 5 && 'Excellent'}
                    </span>
                )}
            </div>

            <div>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your experience..."
                    maxLength={COMMENT_MAX_LENGTH}
                    className="w-full min-h-[100px] p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white/20 resize-y bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    disabled={isSubmitting}
                />
                <CharacterCounter current={comment.length} max={COMMENT_MAX_LENGTH} className="mt-1" />
            </div>

            {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Post Review'}
            </Button>
        </form>
    );
}
