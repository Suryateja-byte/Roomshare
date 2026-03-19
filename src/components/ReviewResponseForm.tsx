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
      className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl"
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isEditing ? "Edit your response" : "Respond to this review"}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a thoughtful response..."
        aria-label={isEditing ? "Edit your response" : "Respond to this review"}
        rows={3}
        className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-zinc-400/40 resize-none text-sm bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
        aria-describedby={error ? "review-response-error" : undefined}
        aria-invalid={!!error}
      />

      {error && (
        <p
          id="review-response-error"
          role="alert"
          className="text-sm text-red-600 dark:text-red-400 mt-2"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          aria-busy={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
