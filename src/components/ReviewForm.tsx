'use client';

import { useState } from 'react';
import { Star, LogIn, CheckCircle2, Edit3, Trash2, Loader2, Calendar, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import CharacterCounter from '@/components/CharacterCounter';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const COMMENT_MAX_LENGTH = 500;

interface ExistingReview {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
}

interface ReviewFormProps {
    listingId?: string;
    targetUserId?: string;
    isLoggedIn?: boolean;
    onSuccess?: () => void;
    hasExistingReview?: boolean;
    existingReview?: ExistingReview;
    hasBookingHistory?: boolean; // Whether user has booking history for this listing
}

export default function ReviewForm({
    listingId,
    targetUserId,
    isLoggedIn = false,
    onSuccess,
    hasExistingReview = false,
    existingReview,
    hasBookingHistory
}: ReviewFormProps) {
    const [rating, setRating] = useState(existingReview?.rating || 0);
    const [comment, setComment] = useState(existingReview?.comment || '');
    const [hoveredRating, setHoveredRating] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [wasDeleted, setWasDeleted] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const router = useRouter();

    // Handle editing an existing review
    const handleUpdate = async () => {
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
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reviewId: existingReview?.id,
                    rating,
                    comment
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update review');
            }

            toast.success('Review updated successfully!');
            setIsEditing(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update review');
            toast.error('Failed to update review');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle deleting a review
    const handleDelete = async () => {
        if (!existingReview?.id) return;

        setIsDeleting(true);

        try {
            const response = await fetch(`/api/reviews?reviewId=${existingReview.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete review');
            }

            toast.success('Review deleted successfully');
            setWasDeleted(true);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete review');
        } finally {
            setIsDeleting(false);
        }
    };

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

    // Show "booking required" message for logged-in users without booking history
    if (listingId && hasBookingHistory === false) {
        return (
            <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="text-center py-4">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Calendar className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h3 className="font-semibold text-lg text-zinc-900 dark:text-white mb-2">
                        Booking required
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        You can leave a review after making a booking request for this listing
                    </p>
                </div>
            </div>
        );
    }

    // Show existing review state with edit/delete options
    if (hasExistingReview && existingReview && !wasDeleted) {
        // Edit mode
        if (isEditing) {
            return (
                <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <h3 className="font-semibold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                        <Edit3 className="w-4 h-4" />
                        Edit Your Review
                    </h3>
                    <div className="space-y-4">
                        {/* Star Rating */}
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHoveredRating(star)}
                                    onMouseLeave={() => setHoveredRating(0)}
                                    className="focus:outline-none transition-transform hover:scale-110"
                                >
                                    <Star
                                        className={cn(
                                            "w-6 h-6 transition-colors",
                                            star <= (hoveredRating || rating)
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-zinc-300 dark:text-zinc-600"
                                        )}
                                    />
                                </button>
                            ))}
                        </div>

                        {/* Comment */}
                        <div>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                maxLength={COMMENT_MAX_LENGTH}
                                rows={3}
                                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300"
                                placeholder="Update your review..."
                                aria-describedby={error ? "review-edit-error" : undefined}
                                aria-invalid={!!error}
                            />
                            <CharacterCounter current={comment.length} max={COMMENT_MAX_LENGTH} />
                        </div>

                        {error && <p id="review-edit-error" role="alert" className="text-red-500 text-sm">{error}</p>}

                        <div className="flex gap-2">
                            <Button
                                onClick={handleUpdate}
                                disabled={isSubmitting}
                                aria-busy={isSubmitting}
                                className="flex-1"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsEditing(false);
                                    setRating(existingReview.rating);
                                    setComment(existingReview.comment);
                                    setError('');
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        // View mode with edit/delete buttons
        return (
            <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">
                            Your Review
                        </h3>
                        <div className="flex items-center gap-1 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    className={cn(
                                        "w-4 h-4",
                                        star <= existingReview.rating
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-zinc-300 dark:text-zinc-600"
                                    )}
                                />
                            ))}
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">
                                {new Date(existingReview.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            &ldquo;{existingReview.comment}&rdquo;
                        </p>
                    </div>
                </div>
                {/* Edit/Delete actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="flex-1"
                    >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={isDeleting}
                        aria-busy={isDeleting}
                        className="flex-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                    >
                        {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </>
                        )}
                    </Button>
                </div>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                </div>
                                <AlertDialogTitle>Delete your review?</AlertDialogTitle>
                            </div>
                            <AlertDialogDescription className="text-left space-y-2">
                                <span className="block">You&apos;re about to delete your {existingReview.rating}-star review:</span>
                                <span className="block italic text-zinc-600 dark:text-zinc-300">&ldquo;{existingReview.comment.length > 100 ? existingReview.comment.slice(0, 100) + '...' : existingReview.comment}&rdquo;</span>
                                <span className="block text-sm text-red-600 dark:text-red-400 mt-2">
                                    This action cannot be undone.
                                </span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Keep Review</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    setShowDeleteDialog(false);
                                    handleDelete();
                                }}
                                disabled={isDeleting}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete Review'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }

    // Show "already reviewed" without details (fallback)
    if (hasExistingReview) {
        return (
            <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="text-center py-4">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-semibold text-lg text-zinc-900 dark:text-white mb-2">
                        Thanks for your review!
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        You&apos;ve already shared your experience
                    </p>
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
                    className="w-full min-h-[100px] p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white/20 resize-y bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300"
                    disabled={isSubmitting}
                    aria-describedby={error ? "review-form-error" : undefined}
                    aria-invalid={!!error}
                />
                <CharacterCounter current={comment.length} max={COMMENT_MAX_LENGTH} className="mt-1" />
            </div>

            {error && <p id="review-form-error" role="alert" className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

            <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Post Review'}
            </Button>
        </form>
    );
}
