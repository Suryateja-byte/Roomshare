"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TurnstileWidget, {
  type TurnstileWidgetRef,
} from "@/components/auth/TurnstileWidget";
import { AuthErrorAlert } from "@/components/auth/AuthErrorAlert";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate Terms of Service acceptance
    if (!acceptedTerms) {
      setError(
        "To create your account, agree to the Terms of Service and Privacy Policy above."
      );
      setLoading(false);
      return;
    }

    // Validate password length (must match server-side schema: min 12)
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      setLoading(false);
      return;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      setError("Those passwords don\u2019t match. Re-enter them and try again.");
      setLoading(false);
      return;
    }

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    const email = data.email as string;

    // Validate email format client-side
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address (e.g., user@example.com)");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, turnstileToken }),
      });

      if (!res.ok) {
        const json = await res.json();
        if (res.status === 429) {
          const retryAfter = json.retryAfter || parseInt(res.headers.get("Retry-After") || "60", 10);
          throw new Error(`Too many attempts. Please wait ${retryAfter} seconds and try again.`);
        }
        throw new Error(json.error || "Failed to register");
      }

      // Auto-sign-in after successful registration — eliminates re-login friction.
      // The user just entered these credentials; no reason to make them type again.
      const signInResult = await signIn("credentials", {
        email: data.email as string,
        password: data.password as string,
        redirect: false,
      });

      if (signInResult?.error) {
        // Fallback: if auto-sign-in fails (e.g., rate limit), redirect to login
        router.push("/login?registered=true");
      } else {
        // Success — go to homepage with fresh session
        window.location.href = "/";
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "We couldn\u2019t connect right now. Check your internet and try again.");
      turnstileRef.current?.reset();
      setTurnstileToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface-canvas font-body selection:bg-on-surface selection:text-surface-container-lowest">
      {/* Left Visual (Dark Theme) */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-primary to-primary-container relative flex-col justify-between p-8 xl:p-12 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/80 to-primary-container opacity-50"></div>

        {/* Logo */}
        <div className="relative z-10">
          <span className="text-xl font-display font-semibold tracking-tighter">
            RoomShare<span className="text-white/70">.</span>
          </span>
        </div>

        {/* Testimonial / Value Prop */}
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-2xl xl:text-3xl font-medium leading-tight">
            &ldquo;Moved in two weeks after signing up. My roommate and I
            actually get along&nbsp;&mdash; that never happened on Craigslist.&rdquo;
          </h2>
          <div className="mt-8 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
              <span className="font-medium text-sm">NK</span>
            </div>
            <div>
              <p className="font-medium text-white">Nina K.</p>
              <p className="text-sm text-white/60">New York City</p>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <p className="relative z-10 text-sm text-white/60">
          © {new Date().getFullYear()} RoomShare Inc.
        </p>
      </div>

      {/* Right Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 pb-20">
        <div className="w-full max-w-sm space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center lg:text-left">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight">
              Join RoomShare
            </h1>
            <p className="text-on-surface-variant mt-2 text-sm sm:text-base">
              Verified roommates, real listings, zero guesswork.
            </p>
          </div>

          {(error || urlError) && (
            <AuthErrorAlert errorCode={urlError} customError={error} />
          )}

          {/* Google Sign Up */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true);
              setError("");
              try {
                await signIn("google", { callbackUrl: "/" });
              } catch (_err) {
                setError(
                  "Google sign-up didn\u2019t connect. Refresh the page and try again."
                );
                setGoogleLoading(false);
              }
            }}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 h-11 sm:h-12 rounded-full border border-outline-variant/20 bg-surface-container-lowest hover:bg-surface-container-high transition-colors font-medium text-on-surface-variant shadow-ambient-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {googleLoading ? "Signing up..." : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/20"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider font-medium">
              <span className="bg-surface-canvas px-4 text-on-surface-variant">
                or continue with email
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Field */}
            <div className="space-y-1">
              <label
                htmlFor="name"
                className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide ml-0.5"
              >
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
                </div>
                <input
                  id="name"
                  type="text"
                  name="name"
                  required
                  autoComplete="name"
                  className="block w-full pl-10 pr-3 py-2.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm"
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide ml-0.5"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
                </div>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="block w-full pl-10 pr-3 py-2.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide ml-0.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
              <PasswordStrengthMeter password={password} className="mt-2" />
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide ml-0.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`block w-full pl-10 pr-10 py-2.5 bg-surface-container-lowest border rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm ${
                    confirmPassword && password !== confirmPassword
                      ? "border-red-400"
                      : confirmPassword && password === confirmPassword
                        ? "border-green-400"
                        : "border-outline-variant/20"
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1 ml-0.5">
                  Passwords don&apos;t match
                </p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p className="text-xs text-green-500 mt-1 ml-0.5">
                  Passwords match
                </p>
              )}
            </div>

            {/* Terms of Service Checkbox */}
            <div className="flex items-start gap-3">
              <input
                id="terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-outline-variant/20 bg-surface-container-lowest text-primary focus:ring-2 focus:ring-primary cursor-pointer"
              />
              <label
                htmlFor="terms"
                className="text-sm text-on-surface-variant cursor-pointer"
              >
                I agree to the{" "}
                <Link
                  href="/terms"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
              </label>
            </div>

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

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={
                loading ||
                (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
                  !turnstileToken)
              }
              className="w-full h-11 sm:h-12 rounded-full shadow-ambient-sm hover:shadow-ambient transition-all"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Join RoomShare <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-on-surface-variant">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignUpClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-surface-canvas">
          <Loader2 className="w-8 h-8 animate-spin text-on-surface" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
