import type { Browser } from "@playwright/test";

export const SEARCH_AUTH_STATES = {
  anonymous: undefined,
  renterBasic: "playwright/.auth/user.json",
  renterSecondary: "playwright/.auth/user2.json",
  reviewer: "playwright/.auth/reviewer.json",
} as const;

export type SearchAuthState = keyof typeof SEARCH_AUTH_STATES;

export async function createAnonymousPage(browser: Browser) {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  return {
    context,
    page,
    async close() {
      await context.close();
    },
  };
}
