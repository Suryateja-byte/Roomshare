"use client";

import { useEffect } from "react";

interface ServiceWorkerRegistrationProps {
  onUpdate?: () => void;
  onSuccess?: () => void;
}

export function ServiceWorkerRegistration({
  onUpdate,
  onSuccess,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In development, don't register SW — actively clean up stale ones
    // from previous production builds to prevent cache-first serving stale assets
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ("caches" in window) {
        caches.keys().then((cacheNames) => {
          for (const cacheName of cacheNames) {
            caches.delete(cacheName);
          }
        });
      }
      return;
    }

    let updateInterval: ReturnType<typeof setInterval> | null = null;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check if there's an update available
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;

          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // Notify callers, but keep updates silent on the web UI.
                onUpdate?.();
              } else if (newWorker.state === "activated") {
                // Content cached for offline use
                onSuccess?.();
              }
            });
          }
        });

        // Check for updates periodically (every hour)
        updateInterval = setInterval(
          () => {
            reg.update();
          },
          60 * 60 * 1000
        );

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

  return null;
}
