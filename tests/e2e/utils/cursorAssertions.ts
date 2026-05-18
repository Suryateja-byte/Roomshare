import { expect, type Page } from "@playwright/test";
import { getCurrentUrl } from "./urlAssertions";

export function expectNoDuplicateValues(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

export function getCursorParam(page: Page): string | null {
  return getCurrentUrl(page).searchParams.get("cursor");
}

export function expectCursorReset(page: Page) {
  expect(getCursorParam(page)).toBeNull();
}
