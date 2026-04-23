"use client";

import { useEffect, useRef } from "react";
import { emitPublicCacheInvalidated } from "@/lib/public-cache/client";

interface ServiceWorkerRegistrationProps {
  onUpdate?: () => void;
  onSuccess?: () => void;
  publicCacheCoherenceEnabled?: boolean;
}

const UPDATE_POLL_MS = 60 * 60 * 1000;
const CACHE_FLOOR_POLL_MS = 60 * 1000;

async function postServiceWorkerMessage(message: { type: string }) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(message);
  } catch {
    // SW readiness is best-effort for cache invalidation only.
  }
}

export function ServiceWorkerRegistration({
  onUpdate,
  onSuccess,
  publicCacheCoherenceEnabled = false,
}: ServiceWorkerRegistrationProps) {
  const lastCacheFloorTokenRef = useRef<string | null>(null);

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

    let disposed = false;
    let updateInterval: ReturnType<typeof setInterval> | null = null;
    let cacheFloorInterval: ReturnType<typeof setInterval> | null = null;
    let removeVisibilityListener: (() => void) | null = null;

    const pollPublicCacheState = async () => {
      if (disposed || !publicCacheCoherenceEnabled) {
        return;
      }

      try {
        const response = await fetch("/api/public-cache/state", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to poll public cache state (${response.status})`);
        }

        const data = (await response.json()) as {
          cacheFloorToken?: string;
        };

        if (disposed || typeof data.cacheFloorToken !== "string") {
          return;
        }

        const previousToken = lastCacheFloorTokenRef.current;
        lastCacheFloorTokenRef.current = data.cacheFloorToken;

        if (previousToken === null || previousToken === data.cacheFloorToken) {
          return;
        }

        await postServiceWorkerMessage({ type: "CLEAR_DYNAMIC_CACHE" });
        emitPublicCacheInvalidated(data.cacheFloorToken);
      } catch (error) {
        console.warn("[SW] Public cache floor poll failed:", error);
      }
    };

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;

          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                onUpdate?.();
              } else if (newWorker.state === "activated") {
                onSuccess?.();
              }
            });
          }
        });

        updateInterval = setInterval(() => {
          reg.update();
        }, UPDATE_POLL_MS);

        if (publicCacheCoherenceEnabled) {
          void pollPublicCacheState();
          cacheFloorInterval = setInterval(() => {
            void pollPublicCacheState();
          }, CACHE_FLOOR_POLL_MS);

          const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
              void pollPublicCacheState();
            }
          };

          document.addEventListener("visibilitychange", handleVisibilityChange);
          removeVisibilityListener = () => {
            document.removeEventListener(
              "visibilitychange",
              handleVisibilityChange
            );
          };

          if (disposed) {
            removeVisibilityListener();
          }
        }

        console.log("[SW] Service Worker registered successfully");
      } catch (error) {
        console.error("[SW] Service Worker registration failed:", error);
      }
    };

    if (document.readyState === "complete") {
      void registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", registerSW);
      if (cacheFloorInterval) {
        clearInterval(cacheFloorInterval);
      }
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      removeVisibilityListener?.();
    };
  }, [onUpdate, onSuccess, publicCacheCoherenceEnabled]);

  return null;
}
