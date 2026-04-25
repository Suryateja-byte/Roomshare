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

async function postServiceWorkerMessage(message: {
  type: string;
  payload?: Record<string, unknown>;
}) {
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

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return buffer;
}

export function ServiceWorkerRegistration({
  onUpdate,
  onSuccess,
  publicCacheCoherenceEnabled = false,
}: ServiceWorkerRegistrationProps) {
  const lastCacheFloorTokenRef = useRef<string | null>(null);
  const lastCursorRef = useRef<string | null>(null);
  const pushKeyRegisteredRef = useRef<string | null>(null);

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
    let eventSource: EventSource | null = null;

    const registerPushSubscription = async (vapidPublicKey?: string) => {
      if (
        disposed ||
        !publicCacheCoherenceEnabled ||
        !vapidPublicKey ||
        pushKeyRegisteredRef.current === vapidPublicKey ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
          }));

        const response = await fetch("/api/public-cache/push-subscription", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (response.ok) {
          pushKeyRegisteredRef.current = vapidPublicKey;
        }
      } catch (error) {
        console.warn("[SW] Public cache push registration failed:", error);
      }
    };

    const connectPublicCacheEvents = (cursor: string | null) => {
      if (
        disposed ||
        !publicCacheCoherenceEnabled ||
        typeof EventSource === "undefined"
      ) {
        return;
      }

      eventSource?.close();
      const params = new URLSearchParams();
      if (cursor) {
        params.set("cursor", cursor);
      }

      const source = new EventSource(
        `/api/public-cache/events${params.size ? `?${params.toString()}` : ""}`
      );
      eventSource = source;

      source.addEventListener("public-cache.invalidate", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            cursor?: string;
            cacheFloorToken?: string;
            unitCacheKey?: string;
            projectionEpoch?: string;
          };

          if (typeof data.cursor === "string") {
            lastCursorRef.current = data.cursor;
          }
          if (typeof data.cacheFloorToken === "string") {
            lastCacheFloorTokenRef.current = data.cacheFloorToken;
            emitPublicCacheInvalidated(data.cacheFloorToken);
          }

          void postServiceWorkerMessage({
            type: "PUBLIC_CACHE_INVALIDATED",
            payload: { ...data, broadcast: false },
          });

          source.close();
          if (!disposed) {
            connectPublicCacheEvents(lastCursorRef.current);
          }
        } catch (error) {
          console.warn("[SW] Public cache event parse failed:", error);
        }
      });

      source.addEventListener("public-cache.state", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            cacheFloorToken?: string;
            latestCursor?: string | null;
            projectionEpochFloor?: string;
          };
          if (typeof data.latestCursor === "string") {
            lastCursorRef.current = data.latestCursor;
          }
          void postServiceWorkerMessage({
            type: "PUBLIC_CACHE_FLOOR",
            payload: data as Record<string, unknown>,
          });
        } catch {
          // State events are advisory; polling remains the fallback.
        }
      });
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; payload?: { cacheFloorToken?: string } }
        | undefined;
      if (
        data?.type === "PUBLIC_CACHE_INVALIDATED" &&
        typeof data.payload?.cacheFloorToken === "string"
      ) {
        emitPublicCacheInvalidated(data.payload.cacheFloorToken);
      }
    };

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
          latestCursor?: string | null;
          projectionEpochFloor?: string;
          vapidPublicKey?: string;
        };

        if (disposed || typeof data.cacheFloorToken !== "string") {
          return;
        }

        void postServiceWorkerMessage({
          type: "PUBLIC_CACHE_FLOOR",
          payload: data as Record<string, unknown>,
        });
        void registerPushSubscription(data.vapidPublicKey);

        const previousToken = lastCacheFloorTokenRef.current;
        lastCacheFloorTokenRef.current = data.cacheFloorToken;
        if (typeof data.latestCursor === "string") {
          lastCursorRef.current = data.latestCursor;
        }

        if (previousToken === null || previousToken === data.cacheFloorToken) {
          if (previousToken === null) {
            connectPublicCacheEvents(lastCursorRef.current);
          }
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
          navigator.serviceWorker.addEventListener(
            "message",
            handleServiceWorkerMessage
          );
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
      eventSource?.close();
      navigator.serviceWorker?.removeEventListener?.(
        "message",
        handleServiceWorkerMessage
      );
    };
  }, [onUpdate, onSuccess, publicCacheCoherenceEnabled]);

  return null;
}
