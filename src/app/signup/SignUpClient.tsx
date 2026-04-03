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
import {
  AuthDivider,
  AuthField,
  AuthGoogleButton,
  AuthPageChrome,
  authPrimaryButtonClassName,
  authToggleButtonClassName,
  authTurnstileSlotClassName,
} from "@/components/auth/AuthPageChrome";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const isTurnstileEnabled = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );

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
        "To create your account, agree to the Terms of Service and Privacy Policy below."
      );
      setTimeout(
        () =>
          document
            .getElementById("terms-checkbox")
            ?.scrollIntoView?.({ behavior: "smooth", block: "center" }),
        100
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
      setError(
        "Those passwords don\u2019t match. Re-enter them and try again."
      );
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
          const retryAfter =
            json.retryAfter ||
            parseInt(res.headers.get("Retry-After") || "60", 10);
          throw new Error(
            `Too many attempts. Please wait ${retryAfter} seconds and try again.`
          );
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
      setError(
        err instanceof Error
          ? err.message
          : "We couldn\u2019t connect right now. Check your internet and try again."
      );
      turnstileRef.current?.reset();
      setTurnstileToken("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageChrome
      title="Join RoomShare"
      subtitle="Verified roommates, real listings, zero guesswork."
      footerPrompt="Already have an account?"
      footerLinkHref="/login"
      footerLinkLabel="Sign in"
      desktopQuote={
        <>
          &ldquo;Moved in two weeks after signing up. My roommate and I actually
          get along&nbsp;&mdash; that never happened on Craigslist.&rdquo;
        </>
      }
      desktopInitials="NK"
      desktopName="Nina K."
      desktopLocation="New York City"
      mobileTestimonialQuote={
        <>&ldquo;Moved in two weeks after signing up.&rdquo;</>
      }
      mobileTestimonialAttribution="Nina K., New York City"
      rightPanelClassName="items-start pt-4 sm:pt-6 md:pt-8 lg:items-center lg:pt-0"
      stackClassName="md:gap-8"
    >
      <div id="form-error" role="alert" aria-atomic="true">
        {(error || urlError) && (
          <AuthErrorAlert errorCode={urlError} customError={error} />
        )}
      </div>

      <AuthGoogleButton
        loading={googleLoading}
        loadingLabel="Signing up..."
        disabled={googleLoading}
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
      />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col">
        <AuthField
          label="Full Name"
          icon={User}
          id="name"
          type="text"
          name="name"
          required
          autoComplete="name"
          placeholder="John Doe"
        />

        <AuthField
          label="Email"
          icon={Mail}
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
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
        >
          <PasswordStrengthMeter
            password={password}
            className="mt-2 min-h-0 md:min-h-[7.5rem]"
          />
        </AuthField>

        <AuthField
          label="Confirm Password"
          icon={Lock}
          id="confirmPassword"
          type={showConfirmPassword ? "text" : "password"}
          name="confirmPassword"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          containerClassName="mb-6 md:mb-5"
          inputClassName={
            confirmPassword && password === confirmPassword
              ? "border-green-400 focus:border-green-500 md:border-green-400 md:focus:border-green-500"
              : confirmPassword.length >= password.length &&
                  password !== confirmPassword
                ? "border-red-400 focus:border-red-500 md:border-red-400 md:focus:border-red-500"
                : ""
          }
          trailingControl={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className={authToggleButtonClassName}
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
            >
              {showConfirmPassword ? (
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
        >
          {confirmPassword && password !== confirmPassword && (
            <p className="ml-1 mt-1 text-xs text-red-500">
              Passwords don&apos;t match
            </p>
          )}
          {confirmPassword && password === confirmPassword && (
            <p className="ml-1 mt-1 text-xs text-green-500">Passwords match</p>
          )}
        </AuthField>

        <div className="mb-6 mt-2 flex items-start gap-3 md:mb-5 md:mt-0">
          <div className="flex h-5 items-center">
            <input
              id="terms-checkbox"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-2 border-stone-300 bg-white text-[#8A3D26] transition-colors focus:ring-2 focus:ring-[#8A3D26]/20 md:mt-1 md:rounded md:border md:border-outline-variant/20 md:bg-surface-container-lowest md:text-primary md:focus:ring-primary"
            />
          </div>
          <label
            htmlFor="terms-checkbox"
            className="cursor-pointer select-none pt-0.5 text-sm leading-tight text-stone-600 md:text-on-surface-variant"
          >
            I agree to the{" "}
            <Link
              href="/terms"
              className="font-semibold text-[#8A3D26] hover:underline underline-offset-4 md:font-medium md:text-primary"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="font-semibold text-[#8A3D26] hover:underline underline-offset-4 md:font-medium md:text-primary"
            >
              Privacy Policy
            </Link>
          </label>
        </div>

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
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Creating account...</span>
            </>
          ) : !turnstileToken && isTurnstileEnabled ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Verifying...</span>
              Verifying...
            </>
          ) : (
            <>
              Join RoomShare <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </form>
    </AuthPageChrome>
  );
}

export default function SignUpClient() {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-label="Loading sign up page"
          className="min-h-screen flex items-center justify-center bg-surface-canvas"
        >
          <Loader2
            className="w-8 h-8 animate-spin text-on-surface"
            aria-hidden="true"
          />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
