import { test, expect } from "@playwright/test";

test.describe("Security Headers", () => {
  test("response includes all required security headers", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    const headers = response!.headers();

    // HSTS — 2 years minimum for preload eligibility
    const hsts = headers["strict-transport-security"];
    if (hsts) {
      // Only present in production (not local dev HTTP)
      expect(hsts).toContain("max-age=");
      const maxAge = parseInt(hsts.match(/max-age=(\d+)/)?.[1] ?? "0", 10);
      expect(maxAge).toBeGreaterThanOrEqual(63072000);
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    }

    // No MIME type sniffing
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // Clickjacking protection
    expect(headers["x-frame-options"]).toBe("DENY");

    // Referrer control
    expect(headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin"
    );

    // XSS filter (legacy browser protection)
    expect(headers["x-xss-protection"]).toBe("1; mode=block");

    // Permissions policy restricts sensitive APIs
    const permPolicy = headers["permissions-policy"];
    expect(permPolicy).toBeTruthy();
    expect(permPolicy).toContain("camera=()");
    expect(permPolicy).toContain("microphone=()");

    // No server fingerprinting (Next.js X-Powered-By disabled)
    expect(headers["x-powered-by"]).toBeUndefined();

    // Content Security Policy present
    expect(headers["content-security-policy"]).toBeTruthy();

    // Cross-origin isolation headers
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  test("CSP includes protective directives", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    const csp = response!.headers()["content-security-policy"];
    expect(csp).toBeTruthy();

    // Essential CSP directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  // P0-2 regression.
  //
  // next.config.ts used to apply `Cache-Control: public, max-age=30` to the whole
  // /listings/* subtree with no `Vary: Cookie`. The detail page swaps in the full
  // Location row (exact street address) for owners and admins, and /create + /[id]/edit
  // are session-gated — so any shared cache could serve one viewer's render to another.
  // This project runs authenticated (storageState: playwright/.auth/user.json), which is
  // required: /listings/create redirects anonymous users to /login, and asserting on the
  // login page's headers would prove nothing.
  for (const path of ["/listings/create", "/listings/does-not-exist"]) {
    test(`does not mark ${path} publicly cacheable`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response).not.toBeNull();

      // next.config header rules key off the URL path, so this holds for the 404 page too.
      const cacheControl = response!.headers()["cache-control"] ?? "";
      expect(cacheControl).not.toContain("public");
      expect(cacheControl).not.toContain("stale-while-revalidate");
    });
  }

  test("no mixed content warnings on homepage", async ({ page }) => {
    const mixedContentWarnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Mixed Content")) {
        mixedContentWarnings.push(msg.text());
      }
    });

    await page.goto("/");
    // Allow page to fully load and any lazy resources to fetch
    await page.waitForLoadState("networkidle");

    expect(mixedContentWarnings).toHaveLength(0);
  });
});
