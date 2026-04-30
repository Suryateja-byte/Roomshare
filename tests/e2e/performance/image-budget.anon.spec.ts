import { test, expect, type Page, type Response } from "@playwright/test";

type ImageResponse = {
  url: string;
  bytes: number;
};

function isImageResponse(response: Response): boolean {
  const url = response.url();
  return (
    response.request().resourceType() === "image" ||
    /\/_next\/image\b/.test(url) ||
    /\.(avif|webp|png|jpe?g|svg)(\?|$)/i.test(url)
  );
}

function collectImageResponses(page: Page) {
  const pending: Promise<ImageResponse | null>[] = [];

  page.on("response", (response) => {
    if (!isImageResponse(response)) return;

    pending.push(
      response
        .finished()
        .then(async (error) => {
          if (error) return null;
          const body = await response.body().catch(() => null);
          if (!body) return null;
          return {
            url: response.url(),
            bytes: body.byteLength,
          };
        })
        .catch(() => null)
    );
  });

  return async () => {
    const settled = await Promise.all(pending);
    return settled.filter((item): item is ImageResponse => item !== null);
  };
}

test.describe("Image Budgets", () => {
  test("homepage image weight stays within production budget", async ({
    page,
  }) => {
    const readImages = collectImageResponses(page);

    await page.goto("/", { waitUntil: "commit" });
    const heroImage = page.locator("picture.home-hero-photo img").first();
    await expect(heroImage).toBeVisible();
    await expect
      .poll(() =>
        heroImage.evaluate((image) => {
          const img = image as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        })
      )
      .toBe(true);
    await page.waitForTimeout(500);

    const images = await readImages();
    const totalBytes = images.reduce((sum, image) => sum + image.bytes, 0);
    const heroBytes = images
      .filter((image) => image.url.includes("hero-living-room"))
      .map((image) => image.bytes);

    expect(images.length, "Expected homepage image requests").toBeGreaterThan(
      0
    );
    expect(
      heroBytes.length,
      "Expected optimized home hero image"
    ).toBeGreaterThan(0);
    expect(
      Math.max(...heroBytes),
      `Hero image variants loaded: ${heroBytes.join(", ")} bytes`
    ).toBeLessThanOrEqual(300 * 1024);
    expect(
      totalBytes,
      `Homepage loaded ${Math.round(totalBytes / 1024)}KB of images`
    ).toBeLessThanOrEqual(1536 * 1024);
  });
});
