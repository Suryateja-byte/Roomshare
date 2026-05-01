"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

type VerifyView =
  | "ready"
  | "verified"
  | "already_verified"
  | "invalid"
  | "expired"
  | "failed";

function getInitialState(token: string | null): {
  view: VerifyView;
  message: string;
} {
  if (!token) {
    return {
      view: "invalid",
      message: "This verification link is missing a token.",
    };
  }

  if (!TOKEN_PATTERN.test(token)) {
    return {
      view: "invalid",
      message: "This verification link is invalid or malformed.",
    };
  }

  return { view: "ready", message: "" };
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { status: sessionStatus, update } = useSession();
  const [view, setView] = useState<VerifyView>(
    () => getInitialState(token).view
  );
  const [message, setMessage] = useState<string>(
    () => getInitialState(token).message
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const initialState = getInitialState(token);
    setView(initialState.view);
    setMessage(initialState.message);
    setIsSubmitting(false);
  }, [token]);

  const handleVerify = async () => {
    if (!token || view === "invalid") {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        code?: string;
        error?: string;
        message?: string;
      };

      if (data.status === "verified" || data.status === "already_verified") {
        setView(data.status);
        setMessage(
          data.message ||
            (data.status === "verified"
              ? "Your email address has been verified."
              : "This email address was already verified.")
        );

        if (sessionStatus === "authenticated") {
          try {
            await update();
          } catch {
            // Keep the success state even if the client session refresh fails.
          }
        }

        return;
      }

      if (response.status === 429) {
        setView("ready");
        setMessage(
          data.message ||
            data.error ||
            "Too many attempts. Please wait before trying again."
        );
        return;
      }

      if (data.code === "expired_token") {
        setView("expired");
        setMessage(
          data.error ||
            "This verification link has expired. Request a new one to continue."
        );
        return;
      }

      if (
        data.code === "missing_token" ||
        data.code === "invalid_token" ||
        data.code === "user_not_found"
      ) {
        setView("invalid");
        setMessage(
          data.error || "This verification link is invalid or unavailable."
        );
        return;
      }

      setView("failed");
      setMessage(
        data.error || "We couldn't verify your email. Please try again."
      );
    } catch {
      setView("failed");
      setMessage("We couldn't verify your email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === "verified" || view === "already_verified") {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              {view === "verified" ? "Email verified" : "Already verified"}
            </h1>
            <p className="text-on-surface-variant mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Button asChild>
                <Link href="/">Go to home</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Go to login</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "expired") {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              Verification link expired
            </h1>
            <p className="text-on-surface-variant mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              <Button asChild>
                <Link href="/verify-expired">Request a new link</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Go home</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "invalid" || view === "failed") {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              {view === "invalid"
                ? "Invalid verification link"
                : "Verification failed"}
            </h1>
            <p className="text-on-surface-variant mb-6">{message}</p>
            <div className="flex flex-col gap-3">
              {token && TOKEN_PATTERN.test(token) && view === "failed" ? (
                <Button onClick={handleVerify} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try again
                    </>
                  )}
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/verify-expired">Get a new link</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/">Go home</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-canvas flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center mb-8">
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              Confirm your email
            </h1>
            <p className="text-on-surface-variant">
              Opening this page does not verify your address. Click the button
              below to confirm it and unlock email-gated features.
            </p>
          </div>

          <div className="bg-surface-container-high rounded-lg p-4 mb-6">
            <p className="text-sm text-on-surface-variant">
              Verification links expire after 24 hours. If this one has expired,
              you can request a fresh link from the recovery page.
            </p>
          </div>

          {message ? (
            <div
              role="alert"
              className="bg-red-50 border border-red-100 rounded-lg p-4 text-sm text-red-700 mb-6"
            >
              {message}
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <Button onClick={handleVerify} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Email"
              )}
            </Button>
            <Button asChild variant="outline">
              <Link href="/verify-expired">Need a new link?</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-canvas" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
