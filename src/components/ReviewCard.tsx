"use client";

import { useState } from "react";
import { Star, MessageSquare, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "./UserAvatar";
import ReviewResponseForm from "./ReviewResponseForm";
import { deleteReviewResponse } from "@/app/actions/review-response";

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

export default function ReviewCard({
  review,
  isOwner = false,
}: ReviewCardProps) {
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [isEditingResponse, setIsEditingResponse] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteResponse = async () => {
    if (
      !review.response ||
      !confirm("Are you sure you want to delete your response?")
    )
      return;

    setIsDeleting(true);
    try {
      await deleteReviewResponse(review.response.id);
    } catch (error) {
      console.error("Error deleting response:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="py-8 first:pt-0 last:pb-0">
      {/* Review Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            image={review.author.image}
            name={review.author.name}
            size="md"
          />
          <div>
            <p className="font-semibold text-on-surface">
              {review.author.name || "Anonymous"}
            </p>
            <p className="text-xs text-on-surface-variant">
              {new Date(review.createdAt).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-4 h-4 ${
                star <= review.rating
                  ? "text-amber-400 fill-amber-400"
                  : "text-on-surface-variant"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Review Content */}
      <p className="mt-4 text-on-surface-variant leading-relaxed">
        {review.comment}
      </p>

      {/* Response Section */}
      {review.response && !isEditingResponse && (
        <div className="mt-4 ml-2 p-4 bg-surface-container-high/40 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-on-surface-variant mb-1">
                Host Response
              </p>
              <p className="text-sm text-on-surface-variant">
                {review.response.content}
              </p>
              <p className="text-xs text-on-surface-variant mt-2">
                {new Date(review.response.createdAt).toLocaleDateString()}
              </p>
            </div>

            {isOwner && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditingResponse(true)}
                  className="text-on-surface-variant hover:text-on-surface-variant"
                  aria-label="Edit response"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteResponse}
                  disabled={isDeleting}
                  className="text-on-surface-variant hover:text-red-600 hover:bg-red-50"
                  aria-label="Delete response"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Response Form for Owner */}
      {isOwner && !review.response && !showResponseForm && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowResponseForm(true)}
          className="mt-4 text-on-surface-variant"
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Respond to this review
        </Button>
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
