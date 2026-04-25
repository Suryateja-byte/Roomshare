"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH,
  PRIVATE_FEEDBACK_DISABLED_CODE,
} from "@/lib/reports/private-feedback";

const PRIVATE_FEEDBACK_OPTIONS = [
  {
    value: "unresponsive_host",
    label: "Host was unresponsive",
  },
  {
    value: "misleading_listing_details",
    label: "Listing details felt misleading",
  },
  {
    value: "pressure_tactics",
    label: "I experienced pressure tactics",
  },
  {
    value: "general_concern",
    label: "General concern",
  },
] as const;

interface PrivateFeedbackDialogProps {
  listingId: string;
  listingTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
}

export default function PrivateFeedbackDialog({
  listingId,
  listingTitle,
  open,
  onOpenChange,
  targetUserId,
}: PrivateFeedbackDialogProps) {
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remainingChars = useMemo(
    () => PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH - details.length,
    [details]
  );

  const reset = () => {
    setCategory("");
    setDetails("");
    setError("");
    setIsSubmitting(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (!category || !details.trim()) {
      setError("Choose a category and describe what happened.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId,
          targetUserId,
          kind: "PRIVATE_FEEDBACK",
          reason: category,
          details: details.trim(),
        }),
      });

      const body =
        response.headers.get("content-type")?.includes("application/json")
          ? ((await response.json()) as { error?: string; code?: string })
          : null;

      if (response.ok) {
        toast.success(
          "Thanks for your feedback. Our team will review it privately."
        );
        handleOpenChange(false);
        return;
      }

      if (response.status === 401) {
        setError("Sign in to share private feedback.");
        return;
      }

      if (response.status === 409) {
        setError("You already shared private feedback for this listing.");
        return;
      }

      if (response.status === 429) {
        setError("Too many submissions. Please wait and try again.");
        return;
      }

      if (body?.code === PRIVATE_FEEDBACK_DISABLED_CODE) {
        setError("Private feedback is not available right now.");
        return;
      }

      if (response.status === 403) {
        setError(body?.error || "You are not allowed to submit this feedback.");
        return;
      }

      setError(body?.error || "Something went wrong. Please try again.");
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Share Private Feedback</DialogTitle>
          <DialogDescription>
            Tell our team about this contact experience. Your feedback stays
            private and is not shown on the listing.
            {listingTitle ? ` Listing: ${listingTitle}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="private-feedback-category">Category</Label>
            <Select onValueChange={setCategory} value={category}>
              <SelectTrigger id="private-feedback-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {PRIVATE_FEEDBACK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="private-feedback-details">Details</Label>
              <span className="text-xs text-on-surface-variant">
                {remainingChars} characters left
              </span>
            </div>
            <Textarea
              id="private-feedback-details"
              maxLength={PRIVATE_FEEDBACK_DETAILS_MAX_LENGTH}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="What happened during the contact or conversation?"
              rows={6}
              value={details}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!category || !details.trim() || isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
