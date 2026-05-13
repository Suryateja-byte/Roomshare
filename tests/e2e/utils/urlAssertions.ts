import { expect, type Page } from "@playwright/test";

export function getCurrentUrl(page: Page): URL {
  return new URL(page.url());
}

export async function expectSaneSearchUrl(page: Page) {
  await expect
    .poll(
      () => {
        const url = getCurrentUrl(page);
        return {
          pathname: url.pathname,
          hasUndefined: url.href.includes("undefined"),
          hasNull: url.href.includes("null"),
          hasNaN: url.href.includes("NaN"),
          hasRawScript: /<script|<\/script|javascript:/i.test(url.href),
        };
      },
      { message: "search URL to stay canonical and safe" }
    )
    .toEqual({
      pathname: "/search",
      hasUndefined: false,
      hasNull: false,
      hasNaN: false,
      hasRawScript: false,
    });
}

export function expectSearchParamAbsent(page: Page, param: string) {
  expect(getCurrentUrl(page).searchParams.has(param)).toBe(false);
}

export async function expectSearchParamAbsentEventually(
  page: Page,
  param: string
) {
  await expect
    .poll(() => getCurrentUrl(page).searchParams.has(param), {
      message: `${param} search param to be absent`,
    })
    .toBe(false);
}

export function expectSearchParamValue(
  page: Page,
  param: string,
  expected: string
) {
  expect(getCurrentUrl(page).searchParams.get(param)).toBe(expected);
}

export async function expectSearchParamValueEventually(
  page: Page,
  param: string,
  expected: string
) {
  await expect
    .poll(() => getCurrentUrl(page).searchParams.get(param), {
      message: `${param} search param to equal ${expected}`,
    })
    .toBe(expected);
}

export async function expectSearchParamMatchingEventually(
  page: Page,
  param: string,
  expected: RegExp
) {
  await expect
    .poll(() => getCurrentUrl(page).searchParams.get(param) ?? "", {
      message: `${param} search param to match ${expected}`,
    })
    .toMatch(expected);
}
