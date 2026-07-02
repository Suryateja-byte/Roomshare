/**
 * Monthly usage caps for paid geocoding providers.
 *
 * Counters live in Upstash Redis so they survive serverless cold starts —
 * a per-instance in-memory Map silently disables the caps on Vercel (every
 * Lambda instance starts from zero). The Map remains only as a best-effort
 * per-instance fallback when Redis is not configured or errors.
 */

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

type GeocodingProvider =
  | "local"
  | "public"
  | "mapbox"
  | "google"
  | "photon"
  | "smarty";
type GeocodingSurface =
  | "public_autocomplete"
  | "public_details"
  | "address_capture";

interface UsageInput {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
  operation: string;
  units?: number;
  estimatedUnitCostUsd?: number;
}

const USAGE_KEY_PREFIX = "geo-usage:";
// Keys are month-scoped, so correctness never depends on expiry; the TTL only
// keeps stale month keys from accumulating.
const USAGE_KEY_TTL_SECONDS = 40 * 24 * 60 * 60;

// --- Redis client (lazy singleton, same pattern as geocoding-cache.ts) ---
let redis: Redis | null = null;
let redisUnavailable = false;

function getRedis(): Redis | null {
  if (redisUnavailable) return null;
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisUnavailable = true;
    return null;
  }

  try {
    redis = new Redis({ url, token });
    return redis;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

// --- Per-instance fallback (dev / missing Redis env / Redis errors) ---
const usageByMonth = new Map<string, number>();

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function usageKey(input: Pick<UsageInput, "provider" | "surface">): string {
  return `${monthKey()}:${input.surface}:${input.provider}`;
}

function normalizeUnits(units: number | undefined): number {
  if (!Number.isFinite(units) || (units ?? 0) <= 0) {
    return 1;
  }
  return Math.trunc(units ?? 1);
}

export async function getMonthlyProviderUsage(input: {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
}): Promise<number> {
  const key = usageKey(input);
  const redisClient = getRedis();

  if (redisClient) {
    try {
      const usage = await redisClient.get<number>(`${USAGE_KEY_PREFIX}${key}`);
      const parsed = typeof usage === "string" ? Number(usage) : usage;
      return typeof parsed === "number" && Number.isFinite(parsed)
        ? parsed
        : 0;
    } catch {
      // Redis error — fall through to the per-instance counter
    }
  }

  return usageByMonth.get(key) ?? 0;
}

export async function isProviderMonthlyCapReached(input: {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
  monthlyCap?: number;
}): Promise<boolean> {
  if (!Number.isFinite(input.monthlyCap) || (input.monthlyCap ?? 0) <= 0) {
    return false;
  }
  return (
    (await getMonthlyProviderUsage(input)) >= Math.trunc(input.monthlyCap ?? 0)
  );
}

export async function recordGeocodingProviderUsage(
  input: UsageInput
): Promise<void> {
  const units = normalizeUnits(input.units);
  const key = usageKey(input);
  let monthToDateUnits: number | undefined;

  const redisClient = getRedis();
  if (redisClient) {
    try {
      const redisKey = `${USAGE_KEY_PREFIX}${key}`;
      monthToDateUnits = await redisClient.incrby(redisKey, units);
      if (monthToDateUnits === units) {
        // First write for this month key — bound its lifetime.
        await redisClient.expire(redisKey, USAGE_KEY_TTL_SECONDS);
      }
    } catch {
      // Redis error — fall through to the per-instance counter
    }
  }

  if (monthToDateUnits === undefined) {
    monthToDateUnits = (usageByMonth.get(key) ?? 0) + units;
    usageByMonth.set(key, monthToDateUnits);
  }

  logger.sync.info("cfm.geocoding.provider_usage", {
    provider: input.provider,
    surface: input.surface,
    operation: input.operation,
    units,
    monthToDateUnits,
    estimatedCostUsd:
      typeof input.estimatedUnitCostUsd === "number"
        ? Number((input.estimatedUnitCostUsd * units).toFixed(6))
        : undefined,
  });
}

export function recordGeocodingProviderSkipped(input: {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
  reason: "missing_key" | "budget_cap" | "disabled";
}): void {
  logger.sync.info("cfm.geocoding.provider_skipped", input);
}

export function clearGeocodingProviderUsageForTests(): void {
  usageByMonth.clear();
  redis = null;
  redisUnavailable = false;
}
