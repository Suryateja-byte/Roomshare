"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Clock,
  Mail,
  AlertCircle,
  Loader2,
  CheckCircle2,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function VerifyExpiredClient() {
  const { data: session, status } = useSession();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          toast.error("Too many requests. Please try again later.");
        } else {
          toast.error(data.error || "Failed to send verification email");
        }
        return;
      }

      setResendSuccess(true);
      toast.success("Verification email sent! Check your inbox.");
    } catch {
      toast.error("Failed to send verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const isLoading = status === "loading";
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-surface-canvas py-12 pt-24">
      <div className="max-w-md mx-auto px-4">
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-10 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8" />
            </div>
            <h1 className="font-display text-2xl font-bold">
              Verification Link Expired
            </h1>
            <p className="text-amber-100 mt-2">
              Your email verification link is no longer valid
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-on-surface-variant" />
              </div>
            ) : resendSuccess ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-on-surface mb-2">
                  Check Your Inbox
                </h2>
                <p className="text-on-surface-variant mb-6">
                  We&apos;ve sent a new verification link to your email address.
                  The link will expire in 24 hours.
                </p>
                <div className="bg-surface-container-high rounded-lg p-4">
                  <p className="text-sm text-on-surface-variant">
                    Didn&apos;t receive the email? Check your spam folder or{" "}
                    <button
                      onClick={() => setResendSuccess(false)}
                      className="text-primary font-medium hover:underline underline-offset-4"
                    >
                      try again
                    </button>
                  </p>
                </div>
              </div>
            ) : isLoggedIn ? (
              <div className="text-center">
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 text-left">
                      Verification links expire after 24 hours for security
                      reasons. Click below to receive a new verification email.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleResend}
                  disabled={isResending}
                  className="w-full"
                  size="lg"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>

                <p className="text-xs text-on-surface-variant mt-4">
                  A new link will be sent to {session?.user?.email}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-surface-container-high rounded-lg p-6 mb-6">
                  <LogIn className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
                  <p className="text-on-surface-variant">
                    Please log in to request a new verification email.
                  </p>
                </div>

                <Button asChild className="w-full" size="lg">
                  <Link href="/login?callbackUrl=/verify-expired">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log In to Continue
                  </Link>
                </Button>

                <p className="text-sm text-on-surface-variant mt-4">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-primary font-medium hover:underline underline-offset-4"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
