"use client";

const PENDING_SEARCH_NAVIGATION_KEY = "__roomsharePendingSearchNavigation";
const DEFAULT_TTL_MS = 10_000;
let popstateListenerRegistered = false;

type PendingSearchNavigation = {
  url: string;
  sourceUrl: string;
  expiresAt: number;
};

type PendingSearchNavigationWindow = Window & {
  [PENDING_SEARCH_NAVIGATION_KEY]?: PendingSearchNavigation;
};

function isSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname === "/search";
  } catch {
    return url.startsWith("/search?");
  }
}

function toPathAndSearch(url: string): string {
  const parsed = new URL(url, window.location.origin);
  return `${parsed.pathname}${parsed.search}`;
}

function handlePendingSearchPopstate() {
  popstateListenerRegistered = false;
  clearPendingSearchNavigation();
}

function ensurePopstateClearListener() {
  if (popstateListenerRegistered) return;
  window.addEventListener("popstate", handlePendingSearchPopstate, {
    once: true,
  });
  popstateListenerRegistered = true;
}

export function clearPendingSearchNavigation() {
  if (typeof window === "undefined") return;
  const win = window as PendingSearchNavigationWindow;
  delete win[PENDING_SEARCH_NAVIGATION_KEY];

  if (popstateListenerRegistered) {
    window.removeEventListener("popstate", handlePendingSearchPopstate);
    popstateListenerRegistered = false;
  }
}

export function markPendingSearchNavigation(
  url: string,
  ttlMs = DEFAULT_TTL_MS
) {
  if (typeof window === "undefined" || !isSearchUrl(url)) return;
  const win = window as PendingSearchNavigationWindow;
  win[PENDING_SEARCH_NAVIGATION_KEY] = {
    url: toPathAndSearch(url),
    sourceUrl: `${window.location.pathname}${window.location.search}`,
    expiresAt: Date.now() + ttlMs,
  };
  ensurePopstateClearListener();
}

export function readPendingSearchNavigation(): string | null {
  if (typeof window === "undefined") return null;

  const win = window as PendingSearchNavigationWindow;
  const pending = win[PENDING_SEARCH_NAVIGATION_KEY];
  if (!pending) return null;

  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (
    Date.now() > pending.expiresAt ||
    currentUrl === pending.url ||
    currentUrl !== pending.sourceUrl
  ) {
    clearPendingSearchNavigation();
    return null;
  }

  return pending.url;
}
