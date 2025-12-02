'use client';

import { useState } from 'react';
import { Star, MessageSquare, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import UserAvatar from './UserAvatar';
import ReviewResponseForm from './ReviewResponseForm';
import { deleteReviewResponse } from '@/app/actions/review-response';
import { useRouter } from 'next/navigation';

interface ReviewCardProps {
    review: {
        id: string;
        rating: number;
        comment: string;
        createdAt: Date;
        author: {
            name: string | null;
            image: string | null;
        };
        response?: {
            id: string;
            content: string;
            createdAt: Date;
        } | null;
    };
    isOwner?: boolean;
}

export default function ReviewCard({ review, isOwner = false }: ReviewCardProps) {
    const [showResponseForm, setShowResponseForm] = useState(false);
    const [isEditingResponse, setIsEditingResponse] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const handleDeleteResponse = async () => {
        if (!review.response || !confirm('Are you sure you want to delete your response?')) return;

        setIsDeleting(true);
        try {
            await deleteReviewResponse(review.response.id);
            router.refresh();
        } catch (error) {
            console.error('Error deleting response:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 py-6 first:pt-0 last:pb-0">
            {/* Review Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <UserAvatar
                        image={review.author.image}
                        name={review.author.name}
                        size="md"
                    />
                    <div>
                        <p className="font-semibold text-zinc-900 dark:text-white">
                            {review.author.name || 'Anonymous'}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(review.createdAt).toLocaleDateString('en-US', {
                                month: 'long',
                                year: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                            key={star}
                            className={`w-4 h-4 ${star <= review.rating
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-zinc-200 dark:text-zinc-600'
                                }`}
                        />
                    ))}
                </div>
            </div>

            {/* Review Content */}
            <p className="mt-4 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {review.comment}
            </p>

            {/* Response Section */}
            {review.response && !isEditingResponse && (
                <div className="mt-4 pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                Host Response
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {review.response.content}
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                {new Date(review.response.createdAt).toLocaleDateString()}
                            </p>
                        </div>

                        {isOwner && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsEditingResponse(true)}
                                    className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                    title="Edit response"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleDeleteResponse}
                                    disabled={isDeleting}
                                    className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                    title="Delete response"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Response Form for Owner */}
            {isOwner && !review.response && !showResponseForm && (
                <button
                    onClick={() => setShowResponseForm(true)}
                    className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                    <MessageSquare className="w-4 h-4" />
                    Respond to this review
                </button>
            )}

            {showResponseForm && !review.response && (
                <ReviewResponseForm
                    reviewId={review.id}
                    onClose={() => setShowResponseForm(false)}
                />
            )}

            {isEditingResponse && review.response && (
                <ReviewResponseForm
                    reviewId={review.id}
                    existingResponse={review.response}
                    onClose={() => setIsEditingResponse(false)}
                />
            )}
        </div>
    );
}
