/**
 * Timezone Edge Case Tests
 *
 * Validates that date parsing, formatting, and filtering behave correctly
 * across timezone boundaries, DST transitions, and UTC midnight.
 *
 * Key functions under test:
 * - parseLocalDate: Parses "YYYY-MM-DD" as local date (not UTC)
 * - parseISODateAsLocal: Parses ISO strings / Date objects as local date
 * - formatDateToYMD: Formats a Date to "YYYY-MM-DD" using local parts
 * - safeParseDate (via parseSearchParams): Validates moveInDate filter strings
 */

import {
  parseLocalDate,
  parseISODateAsLocal,
  formatDateToYMD,
} from "@/lib/utils";
import { parseSearchParams } from "@/lib/search-params";

// Helper: format a local date as YYYY-MM-DD for use in test expectations
const toYMD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

describe("Timezone edge cases", () => {
  // ============================================================================
  // Booking date boundary tests
  // ============================================================================
  describe("booking date boundaries", () => {
    it("parseLocalDate treats YYYY-MM-DD as local midnight, not UTC", () => {
      // The classic timezone bug: new Date("2025-03-15") parses as UTC midnight,
      // which shows as 2025-03-14 in UTC-* timezones. parseLocalDate avoids this.
      const result = parseLocalDate("2025-03-15");

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(2); // March = 2 (0-indexed)
      expect(result.getDate()).toBe(15);
      // Hours should be 0 (local midnight), not affected by UTC offset
      expect(result.getHours()).toBe(0);
    });

    it("handles DST spring-forward date (March) correctly", () => {
      // US DST spring-forward: March 9, 2025 (2:00 AM -> 3:00 AM)
      // Some naive date parsing can produce invalid/shifted dates here.
      const springForward = parseLocalDate("2025-03-09");

      expect(springForward.getFullYear()).toBe(2025);
      expect(springForward.getMonth()).toBe(2);
      expect(springForward.getDate()).toBe(9);
    });

    it("handles DST fall-back date (November) correctly", () => {
      // US DST fall-back: November 2, 2025 (2:00 AM -> 1:00 AM)
      const fallBack = parseLocalDate("2025-11-02");

      expect(fallBack.getFullYear()).toBe(2025);
      expect(fallBack.getMonth()).toBe(10); // November = 10 (0-indexed)
      expect(fallBack.getDate()).toBe(2);
    });

    it("handles UTC midnight boundary (Dec 31 / Jan 1)", () => {
      // A date string for Jan 1 parsed as UTC midnight could appear as Dec 31
      // in western timezones. parseLocalDate must always yield the correct local date.
      const newYear = parseLocalDate("2026-01-01");

      expect(newYear.getFullYear()).toBe(2026);
      expect(newYear.getMonth()).toBe(0); // January
      expect(newYear.getDate()).toBe(1);
    });

    it("handles leap year date (Feb 29)", () => {
      const leapDay = parseLocalDate("2024-02-29");

      expect(leapDay.getFullYear()).toBe(2024);
      expect(leapDay.getMonth()).toBe(1); // February
      expect(leapDay.getDate()).toBe(29);
    });

    it("handles end-of-month boundaries correctly", () => {
      const jan31 = parseLocalDate("2025-01-31");
      const mar31 = parseLocalDate("2025-03-31");
      const apr30 = parseLocalDate("2025-04-30");

      expect(jan31.getDate()).toBe(31);
      expect(mar31.getDate()).toBe(31);
      expect(apr30.getDate()).toBe(30);
    });
  });

  // ============================================================================
  // Date display formatting
  // ============================================================================
  describe("date display formatting", () => {
    it("formatDateToYMD uses local date parts, not UTC", () => {
      // Create a date at local midnight
      const localMidnight = new Date(2025, 5, 15, 0, 0, 0); // June 15 local
      const result = formatDateToYMD(localMidnight);

      expect(result).toBe("2025-06-15");
    });

    it("formatDateToYMD zero-pads single-digit months and days", () => {
      const jan1 = new Date(2025, 0, 1); // January 1
      expect(formatDateToYMD(jan1)).toBe("2025-01-01");

      const sep9 = new Date(2025, 8, 9); // September 9
      expect(formatDateToYMD(sep9)).toBe("2025-09-09");
    });

    it("parseLocalDate -> formatDateToYMD round-trip preserves the date string", () => {
      const dateStrings = [
        "2025-01-01",
        "2025-06-15",
        "2025-12-31",
        "2024-02-29",
        "2025-03-09", // DST spring-forward
        "2025-11-02", // DST fall-back
      ];

      for (const str of dateStrings) {
        const parsed = parseLocalDate(str);
        const formatted = formatDateToYMD(parsed);
        expect(formatted).toBe(str);
      }
    });

    it("parseISODateAsLocal handles ISO string with timezone offset", () => {
      // ISO string from server might include 'T00:00:00.000Z'
      const result = parseISODateAsLocal("2025-06-15T00:00:00.000Z");

      // Should extract 2025-06-15 and parse as local date
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5); // June
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
    });

    it("parseISODateAsLocal handles date-only string without timezone", () => {
      const result = parseISODateAsLocal("2025-06-15");

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(15);
    });

    it("parseISODateAsLocal handles Date objects", () => {
      // Date object that might have non-zero hours due to timezone conversion
      const dateObj = new Date(2025, 5, 15, 14, 30, 0); // June 15 at 2:30 PM
      const result = parseISODateAsLocal(dateObj);

      // Should strip time and return local midnight
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it("parseISODateAsLocal handles ISO string with non-midnight time", () => {
      // Server might return a timestamp with arbitrary time
      const result = parseISODateAsLocal("2025-06-15T23:59:59.999Z");

      // Should still extract the date portion "2025-06-15"
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(15);
    });
  });

  // ============================================================================
  // Search date filter edge cases (safeParseDate via parseSearchParams)
  // ============================================================================
  describe("search date filters", () => {
    it("moveInDate filter accepts a valid future YYYY-MM-DD date", () => {
      // Use a date guaranteed to be in the future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const dateStr = toYMD(futureDate);

      const result = parseSearchParams({ moveInDate: dateStr });
      expect(result.filterParams.moveInDate).toBe(dateStr);
    });

    it("moveInDate filter rejects past dates", () => {
      const result = parseSearchParams({ moveInDate: "2020-01-01" });
      expect(result.filterParams.moveInDate).toBeUndefined();
    });

    it("moveInDate filter rejects far-future dates (>2 years)", () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 3);
      const dateStr = toYMD(farFuture);

      const result = parseSearchParams({ moveInDate: dateStr });
      expect(result.filterParams.moveInDate).toBeUndefined();
    });

    it("moveInDate filter rejects non-YYYY-MM-DD formats", () => {
      const invalidFormats = [
        "01/15/2026",
        "15-01-2026",
        "2026/01/15",
        "Jan 15 2026",
        "2026-1-15",
        "2026-01-5",
      ];

      for (const fmt of invalidFormats) {
        const result = parseSearchParams({ moveInDate: fmt });
        expect(result.filterParams.moveInDate).toBeUndefined();
      }
    });

    it("moveInDate filter rejects ISO strings with time component", () => {
      // safeParseDate requires strict YYYY-MM-DD, no time portion
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const isoWithTime = futureDate.toISOString(); // e.g. "2026-03-21T12:00:00.000Z"

      const result = parseSearchParams({ moveInDate: isoWithTime });
      expect(result.filterParams.moveInDate).toBeUndefined();
    });

    it("moveInDate filter rejects invalid calendar dates", () => {
      // Feb 30 doesn't exist
      const result = parseSearchParams({ moveInDate: "2026-02-30" });
      expect(result.filterParams.moveInDate).toBeUndefined();
    });

    it("moveInDate filter rejects Feb 29 on non-leap year", () => {
      // 2025 is not a leap year
      const result = parseSearchParams({ moveInDate: "2025-02-29" });
      expect(result.filterParams.moveInDate).toBeUndefined();
    });

    it("moveInDate filter accepts today's date", () => {
      const todayStr = toYMD(new Date());
      const result = parseSearchParams({ moveInDate: todayStr });
      expect(result.filterParams.moveInDate).toBe(todayStr);
    });

    it("moveInDate filter handles whitespace-padded input", () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const dateStr = toYMD(futureDate);

      const result = parseSearchParams({ moveInDate: ` ${dateStr} ` });
      expect(result.filterParams.moveInDate).toBe(dateStr);
    });
  });

  // ============================================================================
  // Date comparison edge cases (for booking overlap logic)
  // ============================================================================
  describe("date comparison edge cases", () => {
    it("dates created with parseLocalDate are comparable for same-day check", () => {
      const d1 = parseLocalDate("2025-06-15");
      const d2 = parseLocalDate("2025-06-15");

      expect(d1.getTime()).toBe(d2.getTime());
    });

    it("end-of-day vs start-of-day does not cause off-by-one overlap", () => {
      // Booking A ends on June 15, Booking B starts on June 15
      // Using local dates at midnight, they are equal - not overlapping
      const endA = parseLocalDate("2025-06-15");
      const startB = parseLocalDate("2025-06-15");

      // Same date boundary check: endA <= startB means no overlap
      expect(endA.getTime()).toBe(startB.getTime());
      expect(endA <= startB).toBe(true);
    });

    it("consecutive day dates are properly ordered", () => {
      const day1 = parseLocalDate("2025-06-15");
      const day2 = parseLocalDate("2025-06-16");

      expect(day1 < day2).toBe(true);
      expect(day2 > day1).toBe(true);
      expect(day2.getTime() - day1.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it("year boundary dates are correctly ordered", () => {
      const dec31 = parseLocalDate("2025-12-31");
      const jan1 = parseLocalDate("2026-01-01");

      expect(dec31 < jan1).toBe(true);
    });
  });
});
