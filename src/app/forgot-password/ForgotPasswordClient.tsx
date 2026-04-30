"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TurnstileWidget, {
  type TurnstileWidgetRef,
} from "@/components/auth/TurnstileWidget";
import AuthPageLogo from "@/components/auth/AuthPageLogo";

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });

      const data = await response.json();

      if (response.status === 429) {
        const retryAfter =
          data.retryAfter ||
          parseInt(response.headers.get("Retry-After") || "60", 10);
        throw new Error(
          `Too many attempts. Please wait ${retryAfter} seconds and try again.`
        );
      }

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      turnstileRef.current?.reset();
      setTurnstileToken("");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-svh bg-surface-canvas flex items-center justify-center px-4 font-body">
        <div className="w-full max-w-sm">
          <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              Check your email
            </h1>
            <p className="text-on-surface-variant mb-6">
              If an account exists for <strong>{email}</strong>, you will
              receive a password reset link shortly.
            </p>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSuccess(false);
                  setEmail("");
                }}
              >
                Try another email
              </Button>
              <Link href="/login">
                <Button className="w-full">Back to Login</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-canvas flex items-center justify-center px-4 font-body">
      <div className="w-full max-w-sm">
        <div className="bg-surface-container-lowest rounded-lg shadow-ambient p-8">
          <AuthPageLogo />

          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold text-on-surface mb-2">
              Forgot password?
            </h1>
            <p className="text-on-surface-variant">
              No worries, we&apos;ll send you reset instructions.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">Email address</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-outline-variant/20 text-red-700 px-4 py-3 rounded-lg text-sm"
              >
                {error}
              </div>
            )}

            {/* Turnstile Bot Protection */}
            <TurnstileWidget
              ref={turnstileRef}
              onToken={(token) => {
                setTurnstileToken(token);
                setTurnstileError(false);
              }}
              onExpire={() => setTurnstileToken("")}
              onError={() => setTurnstileError(true)}
            />

            {turnstileError && (
              <p className="text-sm text-red-600">
                Security check failed.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    turnstileRef.current?.reset();
                    setTurnstileError(false);
                  }}
                >
                  Try again
                </button>
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
                  !turnstileToken)
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Reset password"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-on-surface-variant mt-6">
            Remember your password?{" "}
            <Link
              href="/login"
              className="text-primary font-medium hover:underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
