"use client";

import { useState } from "react";
import { Star, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/UserAvatar";
import ReviewResponseForm from "@/components/ReviewResponseForm";

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

export default function ReviewList({
  reviews,
  isOwner = false,
}: {
  reviews: Review[];
  isOwner?: boolean;
}) {
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-on-surface-variant">
        No reviews yet. Be the first to leave one!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {reviews.map((review) => (
        <div
          key={review.id}
          className="border-b border-outline-variant/20 pb-6 last:border-0"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <UserAvatar
                image={review.author.image}
                name={review.author.name}
                size="md"
              />
              <div>
                <h4 className="font-medium text-on-surface">
                  {review.author.name || "Anonymous"}
                </h4>
                <p className="text-xs text-on-surface-variant">
                  {new Date(review.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
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
                    star <= review.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-on-surface-variant"
                  )}
                />
              ))}
            </div>
          </div>
          <p className="text-on-surface-variant leading-relaxed pl-[52px]">
            {review.comment}
          </p>

          {/* Existing response */}
          {review.response && (
            <div className="ml-[52px] mt-3 p-3 bg-surface-canvas rounded-lg border border-outline-variant/20">
              <p className="text-xs font-medium text-on-surface-variant mb-1">
                Host response
              </p>
              <p className="text-sm text-on-surface-variant">
                {review.response.content}
              </p>
            </div>
          )}

          {/* Respond button for owner */}
          {isOwner && !review.response && respondingTo !== review.id && (
            <div className="ml-[52px] mt-2">
              <button
                onClick={() => setRespondingTo(review.id)}
                className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
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
