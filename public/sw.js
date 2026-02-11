/// <reference lib="webworker" />

// P2-08 FIX: Import version from build-generated file for automatic cache invalidation
importScripts('./sw-version.js');

const CACHE_NAME = "roomshare-v" + (self.__SW_VERSION__ || "1");
const STATIC_CACHE = "roomshare-static-v" + (self.__SW_VERSION__ || "1");
const DYNAMIC_CACHE = "roomshare-dynamic-v" + (self.__SW_VERSION__ || "1");

// Assets to cache immediately on install
const STATIC_ASSETS = [
  "/",
  "/offline",
  "/manifest.json",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE &&
              name !== CACHE_NAME
            );
          })
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Skip cross-origin map tile/glyph/sprite requests — let the browser handle them directly
  if (url.hostname === "tiles.openfreemap.org" || url.hostname === "tiles.stadiamaps.com") {
    return;
  }

  // Skip API requests - always go to network
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // For navigation requests, use network-first strategy
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // For static assets (images, fonts, etc.), use cache-first strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Check if request is for a static asset
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

// Network-first strategy: try network, fallback to cache, then offline page
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses (skip opaque cross-origin responses that can't be cloned)
    if (networkResponse.ok && networkResponse.type !== 'opaque') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests, show offline page
    if (request.mode === "navigate") {
      const offlinePage = await caches.match("/offline");
      if (offlinePage) {
        return offlinePage;
      }
    }

    // Return a basic offline response
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// Cache-first strategy: try cache, fallback to network
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    // Only cache responses that can be cloned (not opaque cross-origin responses)
    if (networkResponse.ok && networkResponse.type !== 'opaque') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response("Asset not available", {
      status: 404,
      statusText: "Not Found",
    });
  }
}

// Stale-while-revalidate: return cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);

  const networkPromise = fetch(request).then((networkResponse) => {
    // Clone BEFORE any async operation to prevent body consumption race condition
    // The clone must happen synchronously before return, not inside nested .then()
    if (networkResponse.ok && networkResponse.type !== 'opaque') {
      const responseToCache = networkResponse.clone();
      caches.open(DYNAMIC_CACHE).then((cache) => {
        cache.put(request, responseToCache);
      });
    }
    return networkResponse;
  }).catch((error) => {
    // Network failed, return cached response or re-throw
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  });

  return cachedResponse || networkPromise;
}

// Handle messages from main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CACHE_URLS") {
    const urlsToCache = event.data.payload;
    caches.open(DYNAMIC_CACHE).then((cache) => {
      cache.addAll(urlsToCache);
    });
  }
});
