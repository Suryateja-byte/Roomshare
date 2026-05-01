"use client";

import { useState } from "react";
import { AlertTriangle, X, Loader2, Mail, CheckCircle } from "lucide-react";

interface EmailVerificationBannerProps {
  userEmail?: string | null;
  onDismiss?: () => void;
}

export default function EmailVerificationBanner({
  userEmail,
  onDismiss,
}: EmailVerificationBannerProps) {
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    setIsResending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError(
            data.error ||
              "A verification email is already being prepared. Please wait a moment and try again if it doesn't arrive."
          );
        } else {
          setError(data.error || "Failed to send verification email");
        }
      } else {
        setResendSuccess(true);
        setTimeout(() => setResendSuccess(false), 5000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <section
      className="border-b border-outline-variant/20 bg-amber-50"
      aria-live="polite"
      data-testid="email-verification-banner"
    >
      <div className="px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="shrink-0 pt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-6 text-amber-800">
                <span className="font-medium">Verify your email</span> to unlock
                all features like creating listings and sending messages.
              </p>
              {userEmail && (
                <p className="mt-1 text-xs text-amber-700 [overflow-wrap:anywhere]">
                  Sent to {userEmail}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {resendSuccess ? (
              <span
                className="flex items-center gap-1 text-sm font-medium text-green-700"
                role="status"
              >
                <CheckCircle className="w-4 h-4" aria-hidden />
                Email sent!
              </span>
            ) : (
              <button
                onClick={handleResend}
                disabled={isResending}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" aria-hidden />
                    Resend
                  </>
                )}
              </button>
            )}

            <button
              onClick={onDismiss}
              className="rounded-sm p-1 text-amber-500 transition-colors hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
              aria-label="Dismiss verification reminder"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
