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

export function getMonthlyProviderUsage(input: {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
}): number {
  return usageByMonth.get(usageKey(input)) ?? 0;
}

export function isProviderMonthlyCapReached(input: {
  provider: GeocodingProvider;
  surface: GeocodingSurface;
  monthlyCap?: number;
}): boolean {
  if (!Number.isFinite(input.monthlyCap) || (input.monthlyCap ?? 0) <= 0) {
    return false;
  }
  return getMonthlyProviderUsage(input) >= Math.trunc(input.monthlyCap ?? 0);
}

export function recordGeocodingProviderUsage(input: UsageInput): void {
  const units = normalizeUnits(input.units);
  const key = usageKey(input);
  const nextUsage = (usageByMonth.get(key) ?? 0) + units;
  usageByMonth.set(key, nextUsage);

  logger.sync.info("cfm.geocoding.provider_usage", {
    provider: input.provider,
    surface: input.surface,
    operation: input.operation,
    units,
    monthToDateUnits: nextUsage,
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
}
