"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import EmailVerificationBanner from "./EmailVerificationBanner";
import SuspensionBanner from "./SuspensionBanner";

type AccountNoticePlacement = "global" | "search";

interface AccountNoticeHostProps {
  placement: AccountNoticePlacement;
}

const EMAIL_DISMISS_KEY_PREFIX =
  "roomshare-account-notice-dismissed:email-verification:";

function isSearchRoute(pathname: string | null): boolean {
  return pathname === "/search" || pathname?.startsWith("/search/") === true;
}

function buildDismissKey(email: string | null | undefined): string {
  return `${EMAIL_DISMISS_KEY_PREFIX}${encodeURIComponent(email || "unknown")}`;
}

export default function AccountNoticeHost({
  placement,
}: AccountNoticeHostProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const user = session?.user;
  const onSearchRoute = isSearchRoute(pathname);
  const userEmail = user?.email ?? null;
  const dismissalKey = useMemo(() => buildDismissKey(userEmail), [userEmail]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  const shouldRenderInPlacement =
    placement === "search" ? onSearchRoute : !onSearchRoute;
  const needsVerification = Boolean(
    user && !user.isSuspended && !user.emailVerified
  );

  useEffect(() => {
    if (!needsVerification) {
      setIsDismissed(false);
      setStorageReady(true);
      return;
    }

    setStorageReady(false);

    try {
      setIsDismissed(window.sessionStorage.getItem(dismissalKey) === "1");
    } catch {
      setIsDismissed(false);
    }

    setStorageReady(true);
  }, [dismissalKey, needsVerification]);

  const handleDismissVerification = useCallback(() => {
    setIsDismissed(true);

    try {
      window.sessionStorage.setItem(dismissalKey, "1");
    } catch {
      // Ignore storage failures so dismiss still works for the current render.
    }
  }, [dismissalKey]);

  if (!shouldRenderInPlacement || status === "loading" || !user) {
    return null;
  }

  let notice: ReactNode = null;
  if (user.isSuspended) {
    notice = <SuspensionBanner />;
  } else if (needsVerification) {
    if (!storageReady || isDismissed) {
      return null;
    }

    notice = (
      <EmailVerificationBanner
        userEmail={userEmail}
        onDismiss={handleDismissVerification}
      />
    );
  }

  if (!notice) {
    return null;
  }

  if (placement === "search") {
    return (
      <div
        data-testid="account-notice-host-search"
        className="pointer-events-auto w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 pb-3 sm:pb-4"
      >
        {notice}
      </div>
    );
  }

  return (
    <div
      data-testid="account-notice-host-global"
      className="sticky top-16 md:top-20 z-sticky"
    >
      <div className="w-full max-w-7xl mx-auto px-4">{notice}</div>
    </div>
  );
}
