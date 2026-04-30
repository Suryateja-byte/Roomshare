import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  MouseEventHandler,
} from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import AuthPageLogo from "@/components/auth/AuthPageLogo";

interface AuthPageChromeProps {
  title: string;
  subtitle: string;
  footerPrompt: string;
  footerLinkHref: string;
  footerLinkLabel: string;
  desktopQuote: ReactNode;
  desktopInitials: string;
  desktopName: string;
  desktopLocation: string;
  mobileTestimonialQuote: ReactNode;
  mobileTestimonialAttribution: string;
  mobileVariant?: "default" | "login";
  mobileHeroImageSrc?: string;
  rightPanelClassName?: string;
  stackClassName?: string;
  children: ReactNode;
}

interface AuthFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "size"
> {
  label: string;
  icon: LucideIcon;
  inputRef?: Ref<HTMLInputElement>;
  labelAccessory?: ReactNode;
  trailingControl?: ReactNode;
  containerClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
  children?: ReactNode;
}

interface AuthGoogleButtonProps {
  loading: boolean;
  loadingLabel: string;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  label?: string;
  className?: string;
}

export const authPrimaryButtonClassName =
  "h-14 w-full rounded-2xl bg-gradient-to-br from-primary to-primary-container text-[15px] font-bold text-on-primary shadow-ambient-lg transition-all duration-300 hover:from-primary-container hover:to-primary hover:shadow-ambient active:scale-[0.98] md:h-12 md:rounded-full md:text-sm md:font-medium md:shadow-ambient-sm md:hover:shadow-ambient md:active:scale-[0.97]";

export const authToggleButtonClassName =
  "absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center pr-4 text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 md:pr-3 md:focus-visible:ring-primary/30 md:focus-visible:ring-offset-2";

export const authTurnstileSlotClassName =
  "mb-8 flex w-full max-w-[320px] items-center justify-center self-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 shadow-ambient-sm md:mb-5 md:max-w-none md:self-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none";

export function AuthPageChrome({
  title,
  subtitle,
  footerPrompt,
  footerLinkHref,
  footerLinkLabel,
  desktopQuote,
  desktopInitials,
  desktopName,
  desktopLocation,
  mobileTestimonialQuote,
  mobileTestimonialAttribution,
  mobileVariant = "default",
  mobileHeroImageSrc,
  rightPanelClassName,
  stackClassName,
  children,
}: AuthPageChromeProps) {
  const isLoginMobileVariant = mobileVariant === "login";

  return (
    <div
      className={cn(
        "min-h-svh flex font-body selection:bg-primary selection:text-surface-container-lowest",
        "bg-surface-canvas"
      )}
    >
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-primary to-primary-container relative flex-col justify-between p-8 xl:p-12 text-on-primary">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/80 to-primary-container opacity-50"></div>
        <div className="relative z-10">
          <Link
            href="/"
            className="text-xl font-display font-semibold tracking-tighter hover:opacity-80 transition-opacity"
          >
            RoomShare<span className="text-on-primary/70">.</span>
          </Link>
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-2xl xl:text-3xl font-medium leading-tight">
            {desktopQuote}
          </h2>
          <div className="mt-8 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-surface-container-lowest/12 flex items-center justify-center border border-surface-container-lowest/20">
              <span className="font-medium text-sm">{desktopInitials}</span>
            </div>
            <div>
              <p className="font-medium text-on-primary">{desktopName}</p>
              <p className="text-sm text-on-primary/70">{desktopLocation}</p>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-sm text-on-primary/70">
          © {new Date().getFullYear()} RoomShare Inc.
        </p>
      </div>

      <div
        className={cn(
          isLoginMobileVariant
            ? "w-full lg:w-1/2 flex justify-center px-5 pt-8 pb-6 md:p-4 md:pb-6 lg:p-4 xl:p-6"
            : "w-full lg:w-1/2 flex justify-center p-4 sm:p-6 pb-6",
          rightPanelClassName
        )}
      >
        <div
          className={cn(
            "w-full max-w-[420px] rounded-[2.5rem] border border-outline-variant/15 bg-surface-container-lowest/88 px-6 py-10 shadow-ambient sm:px-8 sm:py-12 md:max-w-[440px] md:rounded-[2rem] md:bg-surface-container-lowest/78 md:px-8 md:py-10 md:shadow-ambient-lg md:backdrop-blur-[18px]",
            isLoginMobileVariant &&
              "relative flex h-auto flex-col overflow-visible rounded-none border-0 bg-transparent px-1 pb-6 pt-2 shadow-none sm:px-2 md:h-auto md:overflow-visible md:rounded-[2rem] md:border md:border-outline-variant/15 md:bg-surface-container-lowest/78 md:px-8 md:py-10 md:shadow-ambient-lg"
          )}
        >
          {isLoginMobileVariant && mobileHeroImageSrc && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 top-[4.5rem] z-0 block h-[18rem] w-[64%] overflow-hidden md:hidden"
            >
              <div
                className="absolute inset-0 bg-no-repeat"
                style={{
                  backgroundImage: `url(${mobileHeroImageSrc})`,
                  backgroundPosition: "center right",
                  backgroundSize: "cover",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 78% 70% at 78% 48%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
                  maskImage:
                    "radial-gradient(ellipse 78% 70% at 78% 48%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.25) 80%, rgba(0,0,0,0) 100%)",
                }}
              />
              <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-surface-canvas via-surface-canvas/40 to-transparent" />
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-surface-canvas via-surface-canvas/35 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface-canvas via-surface-canvas/25 to-transparent" />
            </div>
          )}
          <div
            className={cn(
              "relative z-10 flex flex-col gap-8 md:gap-6 lg:gap-8",
              isLoginMobileVariant &&
                "gap-6 md:h-auto md:gap-6 lg:gap-8",
              stackClassName
            )}
          >
            <div className="flex flex-col items-center text-center md:items-stretch">
              <AuthPageLogo
                className={cn(
                  "md:hidden",
                  isLoginMobileVariant && "mb-2 justify-center"
                )}
                imageClassName={cn(isLoginMobileVariant && "h-10")}
              />

              <div className="hidden md:block">
                <AuthPageLogo />
              </div>

              <div
                className={cn(
                  "text-center lg:text-left",
                  isLoginMobileVariant && "text-left lg:text-left"
                )}
              >
                <h1
                  className={cn(
                    "font-display text-4xl font-semibold leading-none tracking-tight text-on-surface md:text-3xl md:leading-tight",
                    isLoginMobileVariant &&
                      "text-[2.75rem] leading-[1.05] md:text-3xl md:leading-tight"
                  )}
                >
                  {title}
                </h1>
                <p
                  className={cn(
                    "mt-3 max-w-[260px] text-[15px] leading-relaxed text-on-surface-variant sm:text-base md:mt-2 md:max-w-none",
                    isLoginMobileVariant &&
                      "mt-3 max-w-[280px] text-[0.95rem] leading-6 md:max-w-none md:text-base md:leading-relaxed"
                  )}
                >
                  {subtitle}
                </p>
              </div>
            </div>

            {children}

            <div
              className={cn(
                "mt-2 flex flex-col gap-8 text-center md:mt-0 md:gap-0",
                isLoginMobileVariant && "mt-10 gap-3 md:mt-0 md:gap-0"
              )}
            >
              <p
                className={cn(
                  "text-[15px] text-on-surface-variant md:text-sm",
                  isLoginMobileVariant && "text-[0.78rem] leading-4 md:text-sm"
                )}
              >
                {footerPrompt}{" "}
                <Link
                  href={footerLinkHref}
                  className="font-bold text-primary hover:underline underline-offset-4 md:font-semibold"
                >
                  {footerLinkLabel}
                </Link>
              </p>

              {!isLoginMobileVariant && (
                <div className="flex flex-col items-center gap-3 md:hidden">
                  <p className="font-display text-[15px] italic text-on-surface-variant">
                    {mobileTestimonialQuote}
                  </p>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant/80">
                    {mobileTestimonialAttribution}
                  </span>
                </div>
              )}

              <p
                className={cn(
                  "text-xs text-on-surface-variant/80 md:hidden",
                  isLoginMobileVariant && "text-[0.72rem] leading-4"
                )}
              >
                &copy; {new Date().getFullYear()} RoomShare Inc.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthDivider({
  label = "Or continue with email",
  variant = "pill",
  className,
}: {
  label?: string;
  variant?: "pill" | "line";
  className?: string;
}) {
  if (variant === "line") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 text-center text-[0.7rem] font-bold uppercase tracking-[0.26em] text-on-surface-variant",
          className
        )}
      >
        <span className="h-px flex-1 bg-outline-variant/45" aria-hidden />
        <span>{label}</span>
        <span className="h-px flex-1 bg-outline-variant/45" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("flex justify-center", className)}>
      <div className="inline-flex items-center gap-3 rounded-full bg-surface-container-high/55 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant md:text-xs md:font-medium md:tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/35" aria-hidden />
        <span>{label}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-primary/35" aria-hidden />
      </div>
    </div>
  );
}

export function AuthField({
  label,
  icon: Icon,
  inputRef,
  labelAccessory,
  trailingControl,
  containerClassName,
  inputClassName,
  inputWrapperClassName,
  labelClassName,
  iconClassName,
  children,
  ...inputProps
}: AuthFieldProps) {
  return (
    <div
      className={cn("mb-5 flex flex-col gap-1.5 md:gap-1", containerClassName)}
    >
      {labelAccessory ? (
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={inputProps.id}
            className={cn(
              "ml-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant md:ml-0.5 md:tracking-wide",
              labelClassName
            )}
          >
            {label}
          </label>
          {labelAccessory}
        </div>
      ) : (
        <label
          htmlFor={inputProps.id}
          className={cn(
            "ml-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant md:ml-0.5 md:tracking-wide",
            labelClassName
          )}
        >
          {label}
        </label>
      )}

      <div className={cn("group relative", inputWrapperClassName)}>
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-on-surface-variant transition-colors group-focus-within:text-primary md:pl-3 md:group-focus-within:text-on-surface",
            iconClassName
          )}
        >
          <Icon className="h-[18px] w-[18px] md:h-5 md:w-5" strokeWidth={2.1} />
        </div>
        <input
          ref={inputRef}
          className={cn(
            "block w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest py-3.5 pl-11 text-[15px] font-medium text-on-surface shadow-ambient-sm transition-all duration-300 placeholder:text-on-surface-variant/70 focus:border-primary/35 focus:outline-none focus:ring-4 focus:ring-primary/10 md:rounded-xl md:py-2.5 md:pl-10 md:text-sm md:transition-shadow md:duration-200 md:ease-in-out md:focus:ring-2 md:focus:ring-primary/20 md:focus:ring-offset-2",
            trailingControl ? "pr-12 md:pr-10" : "pr-4 md:pr-3",
            inputClassName
          )}
          {...inputProps}
        />
        {trailingControl}
      </div>

      {children}
    </div>
  );
}

export function AuthGoogleButton({
  loading,
  loadingLabel,
  disabled,
  onClick,
  label = "Continue with Google",
  className,
}: AuthGoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest py-3.5 font-semibold text-on-surface shadow-ambient-sm transition-all duration-300 hover:bg-surface-container-high/45 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 md:h-12 md:rounded-full md:py-0 md:font-medium md:shadow-ambient-sm md:transition-colors md:hover:bg-surface-container-high md:active:scale-[0.97]",
        className
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
      {loading ? loadingLabel : label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
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
  );
}
