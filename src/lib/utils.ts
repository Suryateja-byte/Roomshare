import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Parse a YYYY-MM-DD date string as local date (not UTC)
 * Fixes timezone bug where new Date("2025-01-15") is parsed as UTC midnight
 * which can appear as the previous day in timezones behind UTC
 */
export function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Parse an ISO date string (from server) or Date object as local date
 * Extracts the YYYY-MM-DD portion and parses as local time
 * Handles: Date objects, ISO strings, and YYYY-MM-DD strings
 */
export function parseISODateAsLocal(dateInput: string | Date): Date {
    if (!dateInput) return new Date();

    // If it's already a Date object, extract local date parts
    if (dateInput instanceof Date) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }

    // Handle both ISO strings (2025-01-15T00:00:00.000Z) and date-only strings (2025-01-15)
    const dateOnly = dateInput.includes('T') ? dateInput.split('T')[0] : dateInput;
    return parseLocalDate(dateOnly);
}

/**
 * Format a Date object to YYYY-MM-DD string using local date parts
 * Avoids timezone issues with toISOString()
 */
export function formatDateToYMD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
