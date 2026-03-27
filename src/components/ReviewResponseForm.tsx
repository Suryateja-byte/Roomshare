"use client";

import { useState } from "react";
import {
  createReviewResponse,
  updateReviewResponse,
} from "@/app/actions/review-response";
import { MessageSquare, Loader2, Check } from "lucide-react";

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
  onClose,
}: ReviewResponseFormProps) {
  const [content, setContent] = useState(existingResponse?.content || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!existingResponse;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      setError("Please enter a response");
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
        onClose?.();
      }
    } catch (_err) {
      setError("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 bg-surface-canvas rounded-xl"
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-on-surface-variant" />
        <span className="text-sm font-medium text-on-surface-variant">
          {isEditing ? "Edit your response" : "Respond to this review"}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a thoughtful response..."
        aria-label={isEditing ? "Edit your response" : "Respond to this review"}
        rows={3}
        className="w-full px-4 py-3 border border-outline-variant/20 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 resize-none text-sm bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant"
        aria-describedby={error ? "review-response-error" : undefined}
        aria-invalid={!!error}
      />

      {error && (
        <p
          id="review-response-error"
          role="alert"
          className="text-sm text-red-600 mt-2"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          aria-busy={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-on-surface text-white rounded-lg text-sm font-medium hover:bg-on-surface disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {isEditing ? "Saving..." : "Posting..."}
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {isEditing ? "Save Changes" : "Post Response"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
