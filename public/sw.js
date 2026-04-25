/// <reference lib="webworker" />

importScripts('./sw-version.js');

const CACHE_NAME = "roomshare-v" + (self.__SW_VERSION__ || "1");
const STATIC_CACHE = "roomshare-static-v" + (self.__SW_VERSION__ || "1");
const DYNAMIC_CACHE = "roomshare-dynamic-v" + (self.__SW_VERSION__ || "1");
const DYNAMIC_CACHE_PREFIX = "roomshare-dynamic-v";
const PUBLIC_CACHE_PROJECTION_EPOCH_HEADER = "x-roomshare-projection-epoch";
const PUBLIC_CACHE_UNIT_KEY_HEADER = "x-roomshare-unit-cache-key";
const PUBLIC_CACHE_UNIT_KEYS_HEADER = "x-roomshare-unit-cache-keys";

let publicCacheFloorProjectionEpoch = 0;
let publicCacheFloorToken = null;

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

function responseProjectionEpoch(response) {
  const raw = response.headers.get(PUBLIC_CACHE_PROJECTION_EPOCH_HEADER);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function cachedResponseIsBelowFloor(response) {
  const epoch = responseProjectionEpoch(response);
  return epoch !== null && epoch < publicCacheFloorProjectionEpoch;
}

function responseHasUnitCacheKey(response, unitCacheKey) {
  if (!unitCacheKey) {
    return false;
  }

  if (response.headers.get(PUBLIC_CACHE_UNIT_KEY_HEADER) === unitCacheKey) {
    return true;
  }

  const keysHeader = response.headers.get(PUBLIC_CACHE_UNIT_KEYS_HEADER) || "";
  return keysHeader
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(unitCacheKey);
}

async function evictCachedEntriesForUnitKey(unitCacheKey) {
  if (!unitCacheKey) {
    await clearDynamicCaches();
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(DYNAMIC_CACHE_PREFIX))
      .map(async (name) => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        await Promise.all(
          requests.map(async (request) => {
            const response = await cache.match(request);
            if (response && responseHasUnitCacheKey(response, unitCacheKey)) {
              await cache.delete(request);
            }
          })
        );
      })
  );
}

async function broadcastPublicCacheInvalidated(payload) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: "PUBLIC_CACHE_INVALIDATED",
        payload,
      })
    )
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
      if (cachedResponse && !cachedResponseIsBelowFloor(cachedResponse)) {
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
  const usableCachedResponse =
    cachedResponse && !cachedResponseIsBelowFloor(cachedResponse)
      ? cachedResponse
      : null;

  const networkPromise = fetch(request)
    .then(async (networkResponse) => {
      if (shouldCacheResponse(request, url, networkResponse)) {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      if (usableCachedResponse) {
        return usableCachedResponse;
      }
      throw error;
    });

  return usableCachedResponse || networkPromise;
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

  if (event.data && event.data.type === "PUBLIC_CACHE_FLOOR") {
    const payload = event.data.payload || {};
    const nextEpoch = Number(payload.projectionEpochFloor || 0);
    if (Number.isFinite(nextEpoch)) {
      publicCacheFloorProjectionEpoch = Math.max(
        publicCacheFloorProjectionEpoch,
        nextEpoch
      );
    }
    publicCacheFloorToken = payload.cacheFloorToken || publicCacheFloorToken;
    return;
  }

  if (event.data && event.data.type === "PUBLIC_CACHE_INVALIDATED") {
    const payload = event.data.payload || {};
    const work = [evictCachedEntriesForUnitKey(payload.unitCacheKey)];
    if (payload.broadcast !== false) {
      work.push(broadcastPublicCacheInvalidated(payload));
    }
    event.waitUntil(
      Promise.all(work)
    );
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

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }

  if (payload && payload.type === "public-cache.invalidate") {
    event.waitUntil(
      Promise.all([
        evictCachedEntriesForUnitKey(payload.unitCacheKey),
        broadcastPublicCacheInvalidated(payload),
      ])
    );
  }
});
