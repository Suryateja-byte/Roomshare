'use client';

import { useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import UserAvatar from '@/components/UserAvatar';
import ReviewResponseForm from '@/components/ReviewResponseForm';

interface Review {
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
    } | null;
}

export default function ReviewList({ reviews, isOwner = false }: { reviews: Review[]; isOwner?: boolean }) {
    const [respondingTo, setRespondingTo] = useState<string | null>(null);

    if (reviews.length === 0) {
        return (
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                No reviews yet. Be the first to leave one!
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {reviews.map((review) => (
                <div key={review.id} className="border-b border-zinc-100 dark:border-zinc-800 pb-6 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <UserAvatar image={review.author.image} name={review.author.name} size="md" />
                            <div>
                                <h4 className="font-medium text-zinc-900 dark:text-white">{review.author.name || 'Anonymous'}</h4>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {new Date(review.createdAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    className={cn(
                                        "w-4 h-4",
                                        star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-zinc-200 dark:text-zinc-600"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed pl-[52px]">
                        {review.comment}
                    </p>

                    {/* Existing response */}
                    {review.response && (
                        <div className="ml-[52px] mt-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-100 dark:border-zinc-700">
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Host response</p>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">{review.response.content}</p>
                        </div>
                    )}

                    {/* Respond button for owner */}
                    {isOwner && !review.response && respondingTo !== review.id && (
                        <div className="ml-[52px] mt-2">
                            <button
                                onClick={() => setRespondingTo(review.id)}
                                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Respond
                            </button>
                        </div>
                    )}

                    {/* Response form */}
                    {respondingTo === review.id && (
                        <div className="ml-[52px]">
                            <ReviewResponseForm
                                reviewId={review.id}
                                existingResponse={review.response || undefined}
                                onClose={() => setRespondingTo(null)}
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
