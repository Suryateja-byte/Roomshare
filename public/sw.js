/// <reference lib="webworker" />

importScripts('./sw-version.js');

const CACHE_NAME = "roomshare-v" + (self.__SW_VERSION__ || "1");
const STATIC_CACHE = "roomshare-static-v" + (self.__SW_VERSION__ || "1");
const DYNAMIC_CACHE = "roomshare-dynamic-v" + (self.__SW_VERSION__ || "1");
const DYNAMIC_CACHE_PREFIX = "roomshare-dynamic-v";

const STATIC_ASSETS = [
  "/",
  "/offline",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
      await clearDynamicCaches();
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (!url.protocol.startsWith("http")) {
    return;
  }

  if (
    url.hostname === "tiles.openfreemap.org" ||
    url.hostname === "tiles.stadiamaps.com"
  ) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, url));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, url));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, url));
});

function isStaticAsset(pathname) {
  const staticExtensions = [
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
  ];
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

function isDynamicPublicNavigationPath(pathname) {
  return pathname === "/search" || pathname.startsWith("/listings/");
}

function shouldBypassCache(response) {
  const cacheControl = (response.headers.get("Cache-Control") || "").toLowerCase();
  return cacheControl.includes("no-store") || cacheControl.includes("private");
}

function shouldCacheResponse(request, url, response) {
  if (!response.ok || response.type === "opaque") {
    return false;
  }

  if (shouldBypassCache(response)) {
    return false;
  }

  if (request.mode === "navigate" && isDynamicPublicNavigationPath(url.pathname)) {
    return false;
  }

  return true;
}

async function clearDynamicCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(DYNAMIC_CACHE_PREFIX))
      .map((name) => caches.delete(name))
  );
}

async function networkFirst(request, url) {
  const isDynamicPublicNavigation =
    request.mode === "navigate" && isDynamicPublicNavigationPath(url.pathname);

  try {
    const networkResponse = await fetch(request);

    if (shouldCacheResponse(request, url, networkResponse)) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    if (!isDynamicPublicNavigation) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    if (request.mode === "navigate") {
      const offlinePage = await caches.match("/offline");
      if (offlinePage) {
        return offlinePage;
      }
    }

    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function cacheFirst(request, url) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (shouldCacheResponse(request, url, networkResponse)) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response("Asset not available", {
      status: 404,
      statusText: "Not Found",
    });
  }
}

async function staleWhileRevalidate(request, url) {
  const cachedResponse = await caches.match(request);

  const networkPromise = fetch(request)
    .then(async (networkResponse) => {
      if (shouldCacheResponse(request, url, networkResponse)) {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      throw error;
    });

  return cachedResponse || networkPromise;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === "CLEAR_DYNAMIC_CACHE") {
    event.waitUntil(clearDynamicCaches());
    return;
  }

  if (event.data && event.data.type === "CACHE_URLS") {
    const urlsToCache = Array.isArray(event.data.payload)
      ? event.data.payload.filter((value) => {
          try {
            const url = new URL(value, self.location.origin);
            return !isDynamicPublicNavigationPath(url.pathname);
          } catch {
            return false;
          }
        })
      : [];

    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache.addAll(urlsToCache);
      })
    );
  }
});
