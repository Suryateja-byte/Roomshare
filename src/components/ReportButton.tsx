"use client";

import { useState, useEffect } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Assuming we have this
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReportButtonProps {
  listingId: string;
}

export default function ReportButton({ listingId }: ReportButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Prevent hydration mismatch by only rendering Dialog on client
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async () => {
    if (!reason) return;

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
          reason,
          details,
        }),
      });

      if (response.status === 429) {
        setError("Too many reports submitted. Please wait a minute and try again.");
        return;
      }

      if (!response.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setReason("");
        setDetails("");
      }, 2000);
    } catch (_err) {
      setError("Couldn\u2019t connect. Check your internet and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerClassName =
    "w-11 gap-0 rounded-full border border-outline-variant/40 px-0 text-on-surface-variant hover:bg-surface-container-high hover:text-red-600 md:w-auto md:gap-2 md:border-0 md:px-3";

  const triggerContent = (
    <>
      <Flag className="w-4 h-4 shrink-0" />
      <span
        data-testid="report-listing-label"
        className="hidden text-xs md:inline"
      >
        Report this listing
      </span>
    </>
  );

  const renderTriggerButton = () => (
    <Button
      aria-label="Report this listing"
      data-testid="report-listing"
      variant="ghost"
      size="sm"
      className={triggerClassName}
    >
      {triggerContent}
    </Button>
  );

  // Render placeholder button during SSR to prevent hydration mismatch
  if (!mounted) {
    return renderTriggerButton();
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{renderTriggerButton()}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report Listing</DialogTitle>
          <DialogDescription>
            Help us keep the community safe. Why are you reporting this listing?
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center text-green-600 font-medium">
            Thank you for your report. We will review it shortly.
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Select onValueChange={setReason} value={reason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraud">Fraudulent or Scam</SelectItem>
                  <SelectItem value="inappropriate">
                    Inappropriate Content
                  </SelectItem>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="misleading">
                    Misleading Information
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="details">Details (Optional)</Label>
              <Textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Please provide more details..."
              />
            </div>
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!reason || isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
