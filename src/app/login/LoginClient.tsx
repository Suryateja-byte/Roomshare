"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import TurnstileWidget, {
  type TurnstileWidgetRef,
} from "@/components/auth/TurnstileWidget";
import { AuthErrorAlert } from "@/components/auth/AuthErrorAlert";
import AuthPageLogo from "@/components/auth/AuthPageLogo";
import { shouldHighlightEmailForm } from "@/lib/auth-errors";

function LoginForm() {
  const searchParams = useSearchParams();
  const { data: existingSession } = useSession();
  const registered = searchParams.get("registered");
  const urlError = searchParams.get("error");
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  // Focus email input when OAuth error suggests using email form
  useEffect(() => {
    if (urlError && shouldHighlightEmailForm(urlError)) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [urlError]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    // Use callback state first, then hidden response field as a fallback.
    const resolvedTurnstileToken =
      turnstileToken ||
      (formData.get("cf-turnstile-response") as string | null) ||
      undefined;

    try {
      // Clear any existing session to prevent stale data
      if (existingSession?.user) {
        await signOut({ redirect: false });
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        ...(resolvedTurnstileToken
          ? { turnstileToken: resolvedTurnstileToken }
          : {}),
      });

      if (result?.error) {
        const isRateLimited = result.status === 429 ||
          result.error?.toLowerCase().includes("too many");
        setError(
          isRateLimited
            ? "Too many sign-in attempts. Please wait a minute and try again."
            : "Incorrect email or password. Check your details and try again."
        );
        turnstileRef.current?.reset();
        setTurnstileToken("");
        setLoading(false);
      } else {
        // Redirect to callback URL if present (e.g., user was on /saved before login),
        // otherwise go to homepage. Sanitize to prevent open-redirect attacks.
        const callback = searchParams.get("callbackUrl") || "/";
        const safeCallback = callback.startsWith("/") && !callback.startsWith("//")
          ? callback
          : "/";
        window.location.href = safeCallback;
      }
    } catch (_err) {
      setError("We couldn\u2019t connect right now. Check your internet and try again.");
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface-canvas font-body selection:bg-on-surface selection:text-surface-container-lowest">
      {/* Left Visual */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-primary to-primary-container relative flex-col justify-between p-8 xl:p-12 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/80 to-primary-container opacity-50"></div>
        <div className="relative z-10">
          <Link href="/" className="text-xl font-display font-semibold tracking-tighter hover:opacity-80 transition-opacity">
            RoomShare<span className="text-white/70">.</span>
          </Link>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-2xl xl:text-3xl font-medium leading-tight">
            &ldquo;Verified profiles sold me. I knew my roommate was legit
            before we even met.&rdquo;
          </h2>
          <div className="mt-8 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
              <span className="font-medium text-sm">SJ</span>
            </div>
            <div>
              <p className="font-medium text-white">Sarah J.</p>
              <p className="text-sm text-white/60">San Francisco</p>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-sm text-white/60">
          © {new Date().getFullYear()} RoomShare Inc.
        </p>
      </div>

      {/* Right Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 pb-6">
        <div className="w-full max-w-sm space-y-6 sm:space-y-8">
          <AuthPageLogo />
          <div className="text-center lg:text-left">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight">
              Welcome back
            </h1>
            <p className="text-on-surface-variant mt-2 text-sm sm:text-base">
              Sign in to manage your listings and messages.
            </p>
          </div>

          {registered && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm text-center">
              You&apos;re all set! Sign in to get started.
            </div>
          )}

          <div id="form-error" role="alert" aria-atomic="true">
            {(error || urlError) && <AuthErrorAlert errorCode={urlError} customError={error} />}
          </div>

          {/* Google Sign In */}
          <button
            onClick={async () => {
              setGoogleLoading(true);
              setError("");
              try {
                // Clear any existing session to prevent stale data
                if (existingSession?.user) {
                  await signOut({ redirect: false });
                }
                await signIn("google", { callbackUrl: "/" });
              } catch (_err) {
                setError(
                  "Google sign-in didn\u2019t connect. Refresh the page and try again."
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
            {googleLoading ? "Signing in..." : "Continue with Google"}
          </button>

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

          <form onSubmit={handleSubmit} className="space-y-5">
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
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  aria-describedby={error || urlError ? "form-error" : undefined}
                  className="block w-full pl-10 pr-3 py-2.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide ml-0.5"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-on-surface-variant hover:text-on-surface transition-colors min-h-[44px] inline-flex items-center"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  className="block w-full pl-10 pr-10 py-2.5 bg-surface-container-lowest border border-outline-variant/20 rounded-lg text-on-surface placeholder-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 text-sm font-medium transition-shadow duration-200 ease-in-out shadow-ambient-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-on-surface transition-colors min-w-[44px] justify-center focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Turnstile Bot Protection */}
            <div className="flex justify-center">
              <TurnstileWidget
                ref={turnstileRef}
                onToken={(token) => {
                  setTurnstileToken(token);
                  setTurnstileError(false);
                }}
                onExpire={() => setTurnstileToken("")}
                onError={() => setTurnstileError(true)}
              />
            </div>

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
              disabled={
                loading ||
                (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
                  !turnstileToken)
              }
              className="w-full h-11 sm:h-12 rounded-full shadow-ambient-sm hover:shadow-ambient transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Signing in...</span>
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-on-surface-variant">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              Sign up
            </Link>
          </p>

          <div className="lg:hidden text-center pt-6 mt-4 border-t border-outline-variant/10">
            <p className="font-display italic text-sm text-on-surface-variant leading-relaxed">
              &ldquo;Verified profiles sold me.&rdquo;
            </p>
            <p className="text-xs text-on-surface-variant mt-2">Sarah J., San Francisco</p>
          </div>

          <p className="lg:hidden text-center text-xs text-on-surface-variant mt-6">
            &copy; {new Date().getFullYear()} RoomShare Inc.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Loading sign in page" className="min-h-screen flex items-center justify-center bg-surface-canvas">
          <Loader2 className="w-8 h-8 animate-spin text-on-surface" aria-hidden="true" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
