import { AlertOctagon } from "lucide-react";

/**
 * Banner displayed to suspended users informing them of account restrictions.
 * Unlike email verification banner, this cannot be dismissed.
 * P0-01 / P1-01: UI notification for suspended accounts.
 */
export default function SuspensionBanner() {
  return (
    <section
      className="border-b border-outline-variant/20 bg-red-50"
      role="alert"
      aria-live="polite"
      data-testid="suspension-banner"
    >
      <div className="px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 pt-0.5">
            <AlertOctagon className="w-5 h-5 text-red-600" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm leading-6 text-red-800">
              <span className="font-medium">
                Your account has been suspended.
              </span>{" "}
              You cannot create listings, send messages, or make bookings. If
              you believe this is an error, please contact support.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
