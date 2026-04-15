export interface ListingDetailDateParamSource {
  startDate?: string | string[] | null;
  moveInDate?: string | string[] | null;
  endDate?: string | string[] | null;
}

interface ListingDetailDateParams {
  startDate?: string;
  endDate?: string;
}

function getFirstValue(value?: string | string[] | null): string | undefined {
  if (Array.isArray(value)) {
    return value[0] ?? undefined;
  }

  return value ?? undefined;
}

function parseDateParam(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function isValidDateRange(startValue?: string, endValue?: string): boolean {
  const startDate = parseDateParam(startValue);
  const endDate = parseDateParam(endValue);

  return Boolean(startDate && endDate && endDate > startDate);
}

export function resolveListingDetailDateParams(
  source: ListingDetailDateParamSource
): ListingDetailDateParams {
  const canonicalStartDate = getFirstValue(source.startDate);
  const canonicalEndDate = getFirstValue(source.endDate);
  const hasCanonicalAttempt = source.startDate != null;

  if (hasCanonicalAttempt) {
    if (isValidDateRange(canonicalStartDate, canonicalEndDate)) {
      return {
        startDate: canonicalStartDate,
        endDate: canonicalEndDate,
      };
    }

    return {};
  }

  const legacyStartDate = getFirstValue(source.moveInDate);
  if (isValidDateRange(legacyStartDate, canonicalEndDate)) {
    return {
      startDate: legacyStartDate,
      endDate: canonicalEndDate,
    };
  }

  return {};
}

export function buildListingDetailHref(
  listingId: string,
  source: ListingDetailDateParamSource
): string {
  const baseHref = `/listings/${listingId}`;
  const range = resolveListingDetailDateParams(source);

  if (!range.startDate || !range.endDate) {
    return baseHref;
  }

  const params = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  return `${baseHref}?${params.toString()}`;
}
