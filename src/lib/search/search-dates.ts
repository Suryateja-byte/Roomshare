/**
 * Validate a move-in date string. Returns the date if valid (today or future, within 2 years),
 * otherwise returns empty string. This matches the server-side safeParseDate logic.
 */
export function validateMoveInDate(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  // Reject past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return "";

  // Reject dates more than 2 years in the future
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  if (date > maxDate) return "";

  return trimmed;
}

export function validateEndDate(
  value: string | null,
  moveInDate: string
): string {
  const validatedEndDate = validateMoveInDate(value);
  if (!validatedEndDate || !moveInDate) return "";
  return validatedEndDate > moveInDate ? validatedEndDate : "";
}

export function getValidatedSearchDateRange(
  moveInDateValue: string | null,
  endDateValue: string | null
) {
  const moveInDate = validateMoveInDate(moveInDateValue);
  if (!moveInDate) {
    return {
      moveInDate: "",
      endDate: "",
    };
  }

  return {
    moveInDate,
    endDate: validateEndDate(endDateValue, moveInDate),
  };
}
