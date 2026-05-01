const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function buildUtcDateOnly(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  return date;
}

function formatUtcDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseStrictDateOnlyToUtcDate(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = buildUtcDateOnly(year, month, day);

  return formatUtcDateOnly(date) === value ? date : null;
}

export function isStrictDateOnly(value: string): boolean {
  return parseStrictDateOnlyToUtcDate(value) !== null;
}
