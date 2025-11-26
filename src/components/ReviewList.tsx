import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import UserAvatar from '@/components/UserAvatar';

interface Review {
    id: string;
    rating: number;
    comment: string;
    createdAt: Date;
    author: {
        name: string | null;
        image: string | null;
    };
}

export default function ReviewList({ reviews }: { reviews: Review[] }) {
    if (reviews.length === 0) {
        return (
            <div className="text-center py-8 text-zinc-500">
                No reviews yet. Be the first to leave one!
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {reviews.map((review) => (
                <div key={review.id} className="border-b border-zinc-100 pb-6 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <UserAvatar image={review.author.image} name={review.author.name} size="md" />
                            <div>
                                <h4 className="font-medium text-zinc-900">{review.author.name || 'Anonymous'}</h4>
                                <p className="text-xs text-zinc-500">
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
                                        star <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-zinc-200"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    <p className="text-zinc-600 leading-relaxed pl-[52px]">
                        {review.comment}
                    </p>
                </div>
            ))}
        </div>
    );
}
