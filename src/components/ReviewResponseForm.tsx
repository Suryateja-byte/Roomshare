'use client';

import { useState } from 'react';
import { createReviewResponse, updateReviewResponse } from '@/app/actions/review-response';
import { MessageSquare, Loader2, X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ReviewResponseFormProps {
    reviewId: string;
    existingResponse?: {
        id: string;
        content: string;
    };
    onClose?: () => void;
}

export default function ReviewResponseForm({
    reviewId,
    existingResponse,
    onClose
}: ReviewResponseFormProps) {
    const [content, setContent] = useState(existingResponse?.content || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const isEditing = !!existingResponse;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!content.trim()) {
            setError('Please enter a response');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const result = isEditing
                ? await updateReviewResponse(existingResponse.id, content.trim())
                : await createReviewResponse(reviewId, content.trim());

            if (result.error) {
                setError(result.error);
            } else {
                router.refresh();
                onClose?.();
            }
        } catch (err) {
            setError('Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-4 p-4 bg-zinc-50 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700">
                    {isEditing ? 'Edit your response' : 'Respond to this review'}
                </span>
            </div>

            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a thoughtful response..."
                rows={3}
                className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none text-sm"
            />

            {error && (
                <p className="text-sm text-red-600 mt-2">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2 mt-3">
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isSubmitting || !content.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {isEditing ? 'Saving...' : 'Posting...'}
                        </>
                    ) : (
                        <>
                            <Check className="w-4 h-4" />
                            {isEditing ? 'Save Changes' : 'Post Response'}
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
