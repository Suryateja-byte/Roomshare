"use client";

import { useEffect, useState } from "react";

interface ServiceWorkerRegistrationProps {
  onUpdate?: () => void;
  onSuccess?: () => void;
}

export function ServiceWorkerRegistration({
  onUpdate,
  onSuccess,
}: ServiceWorkerRegistrationProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let updateInterval: ReturnType<typeof setInterval> | null = null;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        setRegistration(reg);

        // Check if there's an update available
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;

          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New content available
                setUpdateAvailable(true);
                onUpdate?.();
              } else if (newWorker.state === "activated") {
                // Content cached for offline use
                onSuccess?.();
              }
            });
          }
        });

        // Check for updates periodically (every hour)
        updateInterval = setInterval(() => {
          reg.update();
        }, 60 * 60 * 1000);

        console.log("[SW] Service Worker registered successfully");
      } catch (error) {
        console.error("[SW] Service Worker registration failed:", error);
      }
    };

    // Register service worker after page load
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    return () => {
      window.removeEventListener("load", registerSW);
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, [onUpdate, onSuccess]);

  const handleUpdate = () => {
    if (registration?.waiting) {
      // Send skip waiting message to SW
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      // Reload to activate new version
      window.location.reload();
    }
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg "
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-zinc-600 "
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-zinc-900 ">
            Update available
          </h3>
          <p className="mt-1 text-sm text-zinc-600 ">
            A new version of the app is available.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleUpdate}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 "
            >
              Update now
            </button>
            <button
              onClick={() => setUpdateAvailable(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 "
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
