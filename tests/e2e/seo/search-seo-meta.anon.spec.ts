import { test, expect } from '../helpers';

/**
 * SEO Meta Tag Validation — Search Page
 *
 * Validates that generateMetadata() in src/app/search/page.tsx
 * produces correct <title>, <meta>, <link rel="canonical">, and
 * OpenGraph/Twitter tags for all URL variations.
 *
 * Uses request.get() for raw HTML inspection (fast, no WebGL needed).
 */

// -- Helpers ----------------------------------------------------------------

/** Decode common HTML entities back to their character equivalents */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/** Extract content of a <meta> tag by name or property from raw HTML */
function getMetaContent(html: string, attr: 'name' | 'property', value: string): string | null {
  // Next.js may render name= or property= with varying quote styles and attribute order
  // Match both: <meta name="X" content="Y"> and <meta content="Y" name="X">
  const patterns = [
    new RegExp(`<meta[^>]+${attr}="${value}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attr}="${value}"`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]);
  }
  return null;
}

/** Extract <title> tag content from raw HTML */
function getTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/** Extract canonical URL from <link rel="canonical"> */
function getCanonical(html: string): string | null {
  const match = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)
    || html.match(/<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i);
  return match ? match[1] : null;
}

/** Extract robots meta tag content */
function getRobotsContent(html: string): string | null {
  return getMetaContent(html, 'name', 'robots');
}

/** Fetch raw SSR HTML for a given path */
async function fetchHTML(
  request: import('@playwright/test').APIRequestContext,
  path: string,
): Promise<string> {
  const response = await request.get(path, { timeout: 30_000 });
  expect(response.ok()).toBe(true);
  return response.text();
}

// -- Tests ------------------------------------------------------------------

test.describe('SEO Meta Tags — Search Page', () => {

  test.describe('P0 — Title & Description', () => {

    test('SEO-01: default search renders correct title and description', async ({ request }) => {
      const html = await fetchHTML(request, '/search');
      const title = getTitle(html);
      const description = getMetaContent(html, 'name', 'description');

      expect(title).toBe('Find Rooms & Roommates | Roomshare');
      expect(description).toContain('Browse room listings on Roomshare');
    });

    test('SEO-02: search with query has dynamic title and description', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=San+Francisco');
      const title = getTitle(html);
      const description = getMetaContent(html, 'name', 'description');

      expect(title).toBe('Rooms for rent in San Francisco | Roomshare');
      expect(description).toContain('San Francisco');
      expect(description).toContain('Roomshare');
    });

    test('SEO-11: description is capped at 160 characters', async ({ request }) => {
      const longQuery = 'A'.repeat(200);
      const html = await fetchHTML(request, `/search?q=${longQuery}`);
      const description = getMetaContent(html, 'name', 'description');

      expect(description).not.toBeNull();
      expect(description!.length).toBeLessThanOrEqual(160);
    });
  });

  test.describe('P0 — OpenGraph Tags', () => {

    test('SEO-12: OG tags present and match title/description', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=San+Francisco');
      const title = getTitle(html);
      const description = getMetaContent(html, 'name', 'description');
      const ogTitle = getMetaContent(html, 'property', 'og:title');
      const ogDescription = getMetaContent(html, 'property', 'og:description');
      const ogType = getMetaContent(html, 'property', 'og:type');

      expect(ogTitle).toBe(title);
      expect(ogDescription).toBe(description);
      expect(ogType).toBe('website');
    });

    test('SEO-13: Twitter card tags present and match', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=San+Francisco');
      const title = getTitle(html);
      const description = getMetaContent(html, 'name', 'description');
      const twitterCard = getMetaContent(html, 'name', 'twitter:card');
      const twitterTitle = getMetaContent(html, 'name', 'twitter:title');
      const twitterDescription = getMetaContent(html, 'name', 'twitter:description');

      expect(twitterCard).toBe('summary_large_image');
      expect(twitterTitle).toBe(title);
      expect(twitterDescription).toBe(description);
    });
  });

  test.describe('P0 — Canonical URL', () => {

    test('SEO-05: canonical without query is /search', async ({ request }) => {
      const html = await fetchHTML(request, '/search');
      const canonical = getCanonical(html);

      expect(canonical).toMatch(/\/search$/);
    });

    test('SEO-03: canonical strips cursor pagination param', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=SF&cursor=abc123');
      const canonical = getCanonical(html);

      expect(canonical).toContain('/search?q=SF');
      expect(canonical).not.toContain('cursor');
    });

    test('SEO-04: canonical strips filter params, keeps only q', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=LA&minPrice=500&roomType=Private+Room');
      const canonical = getCanonical(html);

      expect(canonical).toContain('/search?q=LA');
      expect(canonical).not.toContain('minPrice');
      expect(canonical).not.toContain('roomType');
    });
  });

  test.describe('P0 — Robots Directives', () => {

    test('SEO-06: paginated results get noindex', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=SF&cursor=abc123');
      const robots = getRobotsContent(html);

      expect(robots).not.toBeNull();
      expect(robots).toContain('noindex');
      expect(robots).toContain('follow');
    });

    test('SEO-08: simple search allows indexing', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=SF');
      const robots = getRobotsContent(html);

      // Either no robots tag (Next.js default = index) or explicitly allows
      if (robots) {
        expect(robots).not.toContain('noindex');
      }
      // Pass — absence of robots meta = indexable
    });
  });

  test.describe('P1 — Filter Summary in Description', () => {

    test('SEO-09: description includes price filter summary', async ({ request }) => {
      const html = await fetchHTML(request, '/search?minPrice=800&maxPrice=1500');
      const description = getMetaContent(html, 'name', 'description');

      expect(description).toContain('Price: $800-$1500');
    });

    test('SEO-10: description includes room type', async ({ request }) => {
      const html = await fetchHTML(request, '/search?roomType=Private+Room');
      const description = getMetaContent(html, 'name', 'description');

      expect(description).toContain('Room type: Private Room');
    });

    test('SEO-07: 3+ active filters triggers noindex', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=SF&minPrice=500&maxPrice=2000&roomType=Private+Room');
      const robots = getRobotsContent(html);

      expect(robots).not.toBeNull();
      expect(robots).toContain('noindex');
    });
  });

  test.describe('P0 — Resilience (XSS & Edge Cases)', () => {

    test('SEO-R1: XSS in query param is escaped in meta tags', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=<script>alert(1)</script>');

      // Check raw HTML — no unescaped <script> tags in <title> or meta content
      // Next.js should entity-encode: &lt;script&gt; not <script>
      const rawTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      expect(rawTitleMatch).not.toBeNull();
      const rawTitle = rawTitleMatch![1];
      expect(rawTitle).not.toContain('<script>');

      // The decoded title should still be truthy (content exists)
      const title = getTitle(html);
      expect(title).toBeTruthy();
    });

    test('SEO-R2: empty query falls back to default title', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=');
      const title = getTitle(html);

      expect(title).toBe('Find Rooms & Roommates | Roomshare');
    });

    test('SEO-R3: special characters in query are preserved', async ({ request }) => {
      const html = await fetchHTML(request, '/search?q=San+Jos%C3%A9');
      const title = getTitle(html);

      expect(title).toContain('San Jos');
    });
  });

  test.describe('P2 — Structured Data Baseline', () => {

    test('SEO-14: no JSON-LD currently present (baseline)', async ({ request }) => {
      const html = await fetchHTML(request, '/search');
      const hasJsonLd = html.includes('application/ld+json');

      // Documenting current state — no structured data yet
      // When JSON-LD is added, update this test to validate the schema
      expect(hasJsonLd).toBe(false);
    });
  });
});
