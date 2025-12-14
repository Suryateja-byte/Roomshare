'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type LatLngLiteral = { lat: number; lng: number };

interface DistanceRailProps {
  placeSearchRef: React.MutableRefObject<HTMLElement | null>;
  resultsRootRef: React.RefObject<HTMLDivElement | null>;
  origin: LatLngLiteral;
  places: Array<{
    key: string;
    location: any;
    coords: LatLngLiteral | null;  // Pre-extracted coordinates from parent
  }>;
  className?: string;
}

type Badge = { key: string; topPx: number; label: string };

// Retry configuration for location extraction (Google Maps API may not be fully initialized)
const MAX_RETRIES = 10;
const BASE_DELAY = 150; // ms
const MAX_DELAY = 2000; // ms

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineMeters(a: LatLngLiteral, b: LatLngLiteral) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistance(meters: number) {
  if (!isFinite(meters)) return '–';
  const miles = meters / 1609.34;
  if (miles < 0.1) {
    // Show feet for very short distances (under ~500 ft)
    const feet = Math.round(meters / 0.3048);
    return `${feet} ft`;
  }
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function extractLatLng(loc: any): LatLngLiteral | null {
  if (!loc) return null;

  // Handle Google Maps LatLng objects (may need time to initialize)
  if (typeof loc.lat === 'function' && typeof loc.lng === 'function') {
    try {
      const lat = Number(loc.lat());
      const lng = Number(loc.lng());
      // Check for valid coordinates (not NaN, not 0,0 which indicates uninitialized)
      if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return { lat, lng };
      }
    } catch {
      // Getter not ready yet - Google Maps internal object not initialized
      return null;
    }
    return null;
  }

  // Handle plain objects with lat/lng
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    if (isFinite(loc.lat) && isFinite(loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
  }

  // Handle latitude/longitude property names
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    if (isFinite(loc.latitude) && isFinite(loc.longitude)) {
      return { lat: loc.latitude, lng: loc.longitude };
    }
  }

  // Handle nested location property (Google Places API structure)
  if (loc.location) {
    return extractLatLng(loc.location);
  }

  return null;
}

// Open shadow-root traversal only (closed shadow roots cannot be inspected)
function queryAllDeep(root: ParentNode, selector: string): Element[] {
  const out: Element[] = [];
  const queue: ParentNode[] = [root];
  const seen = new Set<ParentNode>();

  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);

    try {
      const found = (node as any).querySelectorAll?.(selector);
      if (found) out.push(...Array.from(found as NodeListOf<Element>));
    } catch { }

    // enqueue open shadow roots
    if (typeof document !== 'undefined') {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let el = walker.nextNode() as Element | null;
      while (el) {
        const sr = (el as any).shadowRoot as ShadowRoot | null;
        if (sr) queue.push(sr);
        el = walker.nextNode() as Element | null;
      }
    }
  }

  return out;
}

function isVisibleRowCandidate(el: HTMLElement, bounds: DOMRect) {
  const r = el.getBoundingClientRect();
  if (r.height < 36) return false;
  if (r.bottom < bounds.top + 8 || r.top > bounds.bottom - 8) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return true;
}

function dedupeByTop(rows: HTMLElement[]) {
  const best = new Map<number, { el: HTMLElement; rect: DOMRect }>();

  for (const el of rows) {
    const rect = el.getBoundingClientRect();
    const k = Math.round(rect.top);
    const prev = best.get(k);
    if (!prev || rect.height > prev.rect.height) best.set(k, { el, rect });
  }

  return Array.from(best.values())
    .sort((a, b) => a.rect.top - b.rect.top)
    .map((x) => x.el);
}

function pickRowElements(placeSearchEl: HTMLElement, expectedCount: number): HTMLElement[] {
  const bounds = placeSearchEl.getBoundingClientRect();
  if (expectedCount <= 0) return [];

  const selectors = [
    'gmp-place-list-item',
    '[role="listitem"]',
    '[role="option"]',
    'li',
  ];

  for (const sel of selectors) {
    const els = queryAllDeep(placeSearchEl, sel)
      .filter((n): n is HTMLElement => n instanceof HTMLElement)
      .filter((el) => isVisibleRowCandidate(el, bounds));

    const unique = dedupeByTop(els);
    if (unique.length >= expectedCount) return unique.slice(0, expectedCount);
  }

  // fallback: clickable blocks
  const fallback = queryAllDeep(placeSearchEl, 'button,a,[tabindex]')
    .filter((n): n is HTMLElement => n instanceof HTMLElement)
    .filter((el) => isVisibleRowCandidate(el, bounds));

  return dedupeByTop(fallback).slice(0, expectedCount);
}

export function DistanceRail({
  placeSearchRef,
  resultsRootRef,
  origin,
  places,
  className,
}: DistanceRailProps) {
  const rafRef = useRef<number | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const lastSigRef = useRef<string>('');
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRef = useRef<() => void>(() => {});

  // Cache coordinates locally - persists even when places array reference changes
  const coordsCacheRef = useRef<Map<string, LatLngLiteral>>(new Map());
  // Track when places array actually changes (new search results)
  const placesIdRef = useRef<string>('');

  const scheduleRetry = useCallback(() => {
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      const delay = Math.min(BASE_DELAY * Math.pow(1.3, retryCountRef.current), MAX_DELAY);
      retryTimeoutRef.current = setTimeout(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          // Re-run sync logic via ref to avoid circular dependency
          syncRef.current();
        });
      }, delay);
    }
  }, []);

  const syncInternal = useCallback(() => {
    const placeSearchEl = placeSearchRef.current;
    const root = resultsRootRef.current;
    if (!placeSearchEl || !root || places.length === 0) {
      setBadges([]);
      return;
    }

    const containerRect = placeSearchEl.getBoundingClientRect();

    // Wait for container to have sufficient height before calculating positions
    if (containerRect.height < 50) {
      // Container not ready yet - schedule retry
      scheduleRetry();
      return;
    }

    // Build current places identity string to detect actual data changes
    const currentPlacesId = places.map(p => p.key).join('|');
    const isNewPlacesData = currentPlacesId !== placesIdRef.current;

    if (isNewPlacesData) {
      placesIdRef.current = currentPlacesId;
      // Reset retry counter only when we have genuinely new places data
      retryCountRef.current = 0;
      // Clear stale cache entries (keep only keys that exist in new places)
      const validKeys = new Set(places.map(p => p.key));
      for (const key of coordsCacheRef.current.keys()) {
        if (!validKeys.has(key)) {
          coordsCacheRef.current.delete(key);
        }
      }
    }

    // Resolve coordinates using multi-tier resolution:
    // 1. Use pre-extracted coords from parent (place.coords)
    // 2. Use locally cached coords (from previous successful extraction)
    // 3. Try to extract from location reference (may fail if stale)
    let resolvedCount = 0;
    const resolvedCoords: Map<string, LatLngLiteral> = new Map();

    for (const place of places) {
      // Priority 1: Use pre-extracted coords from parent
      if (place.coords) {
        resolvedCoords.set(place.key, place.coords);
        // Update cache with parent-provided coords
        coordsCacheRef.current.set(place.key, place.coords);
        resolvedCount++;
        continue;
      }

      // Priority 2: Use locally cached coords (from previous successful extraction)
      const cached = coordsCacheRef.current.get(place.key);
      if (cached) {
        resolvedCoords.set(place.key, cached);
        resolvedCount++;
        continue;
      }

      // Priority 3: Try to extract from location reference (may be stale)
      const extracted = extractLatLng(place.location);
      if (extracted) {
        resolvedCoords.set(place.key, extracted);
        // Cache for future use
        coordsCacheRef.current.set(place.key, extracted);
        resolvedCount++;
      }
    }

    const rows = pickRowElements(placeSearchEl, places.length);
    const rootRect = root.getBoundingClientRect();

    const next: Badge[] = [];

    // Use fallback positioning if we can't find enough row elements (closed shadow DOM)
    const useFallback = rows.length < places.length;

    if (useFallback) {
      // Estimate row height based on container height and number of places
      const estimatedRowHeight = Math.max(containerRect.height / places.length, 60);

      for (let i = 0; i < places.length; i++) {
        const loc = resolvedCoords.get(places[i].key);
        if (!loc) continue;

        // Estimate position: center of each "virtual" row
        const topPx = (i * estimatedRowHeight) + (estimatedRowHeight / 2);
        const distM = haversineMeters(origin, loc);

        next.push({
          key: places[i].key,
          topPx,
          label: formatDistance(distM),
        });
      }
    } else {
      // Original logic when rows are found
      for (let i = 0; i < places.length; i++) {
        const rowEl = rows[i];
        const loc = resolvedCoords.get(places[i].key);
        if (!rowEl || !loc) continue;

        const rowRect = rowEl.getBoundingClientRect();

        // row center inside the shared resultsRoot coordinate space
        const topPx = rowRect.top - rootRect.top + rowRect.height / 2;

        const distM = haversineMeters(origin, loc);
        next.push({
          key: places[i].key,
          topPx,
          label: formatDistance(distM),
        });
      }
    }

    const sig = next.map((b) => `${b.key}:${Math.round(b.topPx)}:${b.label}`).join('|');
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setBadges(next);
    }

    // Only schedule retry if we haven't resolved all locations yet
    if (resolvedCount < places.length && retryCountRef.current < MAX_RETRIES) {
      scheduleRetry();
    }
  }, [placeSearchRef, resultsRootRef, places, origin, scheduleRetry]);

  // Keep syncRef updated for use in scheduleRetry
  syncRef.current = syncInternal;

  const sync = useCallback(() => {
    syncInternal();
  }, [syncInternal]);

  const scheduleSync = useCallback(() => {
    // Don't reset retry counter here - syncInternal handles it
    // based on whether places data actually changed (not just observer triggers)
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(sync);
  }, [sync]);

  // run when places change
  useLayoutEffect(() => {
    scheduleSync();
  }, [places.length, scheduleSync]);

  // event-driven re-sync (no infinite loop)
  useEffect(() => {
    const placeSearchEl = placeSearchRef.current;
    const root = resultsRootRef.current;
    if (!placeSearchEl || !root) return;

    const onLoad = () => scheduleSync();
    placeSearchEl.addEventListener('gmp-load', onLoad);

    const ro = new ResizeObserver(() => scheduleSync());
    ro.observe(root);
    ro.observe(placeSearchEl);

    const mo = new MutationObserver(() => scheduleSync());
    mo.observe(placeSearchEl, { childList: true, subtree: true, attributes: true });

    // capture scroll from any scroll container (chat list scroll included)
    const onAnyScroll = () => scheduleSync();
    document.addEventListener('scroll', onAnyScroll, true);
    window.addEventListener('resize', onAnyScroll);

    // Initial sync after short delay
    const t1 = window.setTimeout(() => scheduleSync(), 120);
    // Secondary sync for late DOM renders (closed shadow DOM may take longer)
    const t2 = window.setTimeout(() => scheduleSync(), 500);
    // Third sync for very slow renders
    const t3 = window.setTimeout(() => scheduleSync(), 1000);

    return () => {
      placeSearchEl.removeEventListener('gmp-load', onLoad);
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('scroll', onAnyScroll, true);
      window.removeEventListener('resize', onAnyScroll);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [placeSearchRef, resultsRootRef, scheduleSync]);

  return (
    <div className={cn('relative w-[60px] sm:w-[84px] self-stretch', className)} aria-hidden="true">
      <div className="absolute inset-0 pointer-events-none select-none">
        {badges.map((b) => (
          <div
            key={b.key}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${b.topPx}px` }}
          >
            <div
              className={cn(
                'px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold tabular-nums',
                'bg-white/90 dark:bg-zinc-900/80',
                'text-zinc-700 dark:text-zinc-200',
                'border border-zinc-200/70 dark:border-zinc-700/70',
                'shadow-sm whitespace-nowrap'
              )}
            >
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
