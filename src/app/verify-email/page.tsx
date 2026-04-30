import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify Email | RoomShare",
};

export default function VerifyEmailPage() {
  return (
    <div className="min-h-svh bg-surface-canvas py-12 pt-24">
      <div className="mx-auto max-w-md rounded-lg bg-surface-container-lowest p-8 shadow-ambient">
        <h1 className="text-2xl font-bold text-on-surface">Verify Email</h1>
        <p className="mt-3 text-sm text-on-surface-variant">
          Use the verification link from your email to confirm your account.
        </p>
        <p className="mt-2 text-sm text-on-surface-variant">
          If your link has expired, request a new one from the
          {" "}
          <Link
            href="/verify-expired"
            className="font-medium text-primary hover:underline"
          >
            verification help page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
