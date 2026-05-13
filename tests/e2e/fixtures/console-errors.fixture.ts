import { test as base, expect } from "../helpers/test-utils";
import type { ConsoleMessage } from "@playwright/test";

const BENIGN_ERROR_PATTERNS = [
  "mapbox",
  "maplibre",
  "webpack",
  "hmr",
  "hydrat",
  "favicon",
  "resizeobserver",
  "webgl",
  "failed to create",
  "404",
  "net::err",
  "failed to load resource",
  "aborterror",
  "abort",
  "cancelled",
  "failed to fetch",
  "failed to fetch map listings",
  "map listings fetch failed",
  "load failed",
  "chunkloaderror",
  "loading chunk",
  "next_",
  "next-",
  "fetchtimeouterror",
  "timed out",
  "photon.komoot",
  "timeouterror",
  "supabase.co",
];

const BENIGN_PAGE_ERROR_PATTERNS = [
  // Chromium can emit this for an internal/extension manifest during local E2E
  // runs even when the app manifest is valid.
  "manifest file is empty",
];

export function filterBenignSearchConsoleErrors(errors: string[]): string[] {
  return errors.filter((error) => {
    const normalized = error.toLowerCase();
    return !BENIGN_ERROR_PATTERNS.some((pattern) =>
      normalized.includes(pattern)
    );
  });
}

export function filterBenignSearchPageErrors(errors: string[]): string[] {
  return errors.filter((error) => {
    const normalized = error.toLowerCase();
    return !BENIGN_PAGE_ERROR_PATTERNS.some((pattern) =>
      normalized.includes(pattern)
    );
  });
}

export const test = base.extend<{
  consoleErrors: string[];
  pageErrors: string[];
  assertNoUnhandledErrors: () => Promise<void>;
}>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    const handler = (message: ConsoleMessage) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    };

    page.on("console", handler);
    await use(errors);
    page.off("console", handler);
  },

  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    const handler = (error: Error) => {
      errors.push(error.message);
    };

    page.on("pageerror", handler);
    await use(errors);
    page.off("pageerror", handler);
  },

  assertNoUnhandledErrors: async ({ consoleErrors, pageErrors }, use) => {
    await use(async () => {
      expect(filterBenignSearchPageErrors(pageErrors)).toEqual([]);
      expect(filterBenignSearchConsoleErrors(consoleErrors)).toEqual([]);
    });
  },
});

export { expect };
