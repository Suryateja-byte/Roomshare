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
import {
  AuthDivider,
  AuthField,
  AuthGoogleButton,
  AuthPageChrome,
  authPrimaryButtonClassName,
  authToggleButtonClassName,
  authTurnstileSlotClassName,
} from "@/components/auth/AuthPageChrome";
import { shouldHighlightEmailForm } from "@/lib/auth-errors";

function LoginForm() {
  const searchParams = useSearchParams();
  const { data: existingSession } = useSession();
  const registered = searchParams.get("registered");
  const urlError = searchParams.get("error");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const isTurnstileEnabled = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );

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
        const isRateLimited =
          result.status === 429 ||
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
        const safeCallback =
          callback.startsWith("/") && !callback.startsWith("//")
            ? callback
            : "/";
        window.location.href = safeCallback;
      }
    } catch (_err) {
      setError(
        "We couldn\u2019t connect right now. Check your internet and try again."
      );
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setLoading(false);
    }
  };

  return (
    <AuthPageChrome
      title="Welcome back"
      subtitle="Sign in to manage your listings and messages."
      footerPrompt={"Don't have an account?"}
      footerLinkHref="/signup"
      footerLinkLabel="Sign up"
      desktopQuote={
        <>
          &ldquo;Verified profiles sold me. I knew my roommate was legit before
          we even met.&rdquo;
        </>
      }
      desktopInitials="SJ"
      desktopName="Sarah J."
      desktopLocation="San Francisco"
      mobileTestimonialQuote={<>&ldquo;Verified profiles sold me.&rdquo;</>}
      mobileTestimonialAttribution="Sarah J., San Francisco"
      rightPanelClassName="items-center"
    >
      {registered && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-700 md:rounded-lg">
          You&apos;re all set! Sign in to get started.
        </div>
      )}

      <div id="form-error" role="alert" aria-atomic="true">
        {(error || urlError) && (
          <AuthErrorAlert errorCode={urlError} customError={error} />
        )}
      </div>

      <AuthGoogleButton
        loading={googleLoading}
        loadingLabel="Signing in..."
        disabled={googleLoading}
        onClick={async () => {
          setGoogleLoading(true);
          setError("");
          try {
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
      />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col">
        <AuthField
          label="Email"
          icon={Mail}
          inputRef={emailInputRef}
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-describedby={error || urlError ? "form-error" : undefined}
          placeholder="you@example.com"
        />

        <AuthField
          label="Password"
          icon={Lock}
          id="password"
          type={showPassword ? "text" : "password"}
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          containerClassName="mb-6 md:mb-5"
          labelAccessory={
            <Link
              href="/forgot-password"
              className="min-h-[44px] inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A3D26] transition-colors hover:text-[#73321f] md:text-xs md:font-normal md:normal-case md:tracking-normal md:text-on-surface-variant md:hover:text-on-surface"
            >
              Forgot password?
            </Link>
          }
          trailingControl={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={authToggleButtonClassName}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff
                  className="h-[18px] w-[18px] md:h-5 md:w-5"
                  strokeWidth={1.8}
                />
              ) : (
                <Eye
                  className="h-[18px] w-[18px] md:h-5 md:w-5"
                  strokeWidth={1.8}
                />
              )}
            </button>
          }
        />

        {isTurnstileEnabled && (
          <div className={authTurnstileSlotClassName}>
            <TurnstileWidget
              ref={turnstileRef}
              className="flex justify-center overflow-hidden"
              onToken={(token) => {
                setTurnstileToken(token);
                setTurnstileError(false);
              }}
              onExpire={() => setTurnstileToken("")}
              onError={() => setTurnstileError(true)}
            />
          </div>
        )}

        {turnstileError && (
          <p className="mb-6 text-sm text-red-600 md:mb-5">
            Security check failed.{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
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
          disabled={loading || (isTurnstileEnabled && !turnstileToken)}
          className={authPrimaryButtonClassName}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Signing in...</span>
            </>
          ) : !turnstileToken && isTurnstileEnabled ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Verifying...</span>
              Verifying...
            </>
          ) : (
            <>
              Sign in <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthPageChrome>
  );
}

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading sign in page"
          className="min-h-screen flex items-center justify-center bg-surface-canvas"
        >
          <Loader2
            className="w-8 h-8 animate-spin text-on-surface"
            aria-hidden="true"
          />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
