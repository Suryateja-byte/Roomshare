/**
 * @jest-environment node
 */

/**
 * Real (unmocked) sharp behaviour tests.
 *
 * WHY THIS FILE EXISTS: every other sharp test in this repo mocks the library
 * (src/__tests__/api/upload-integration.test.ts, verification-documents.test.ts,
 * lib/embeddings/images.test.ts), and the Playwright image specs route-mock
 * /api/upload (tests/e2e/page-objects/create-listing.page.ts). Before this file,
 * the entire suite passed with sharp uninstalled and NOTHING anywhere exercised
 * real libvips.
 *
 * That mattered because `.rotate()` with no arguments is the ONLY thing stripping
 * EXIF — including GPS coordinates — from user-uploaded listing photos and from
 * KYC verification documents. A silent upstream change there leaks users' home
 * coordinates and would be invisible to every other check in the project.
 *
 * These tests mirror the exact call shapes in production. Keep them in sync:
 *   - src/app/api/upload/route.ts:257-281            (photos: rotate / animated gif)
 *   - src/app/api/verification/upload/route.ts:99-113 (KYC docs: rotate)
 *   - src/lib/embeddings/images.ts:86-92              (embeddings: resize + mozjpeg)
 *
 * Do NOT add jest.mock("sharp") here — that would defeat the entire point.
 * Fixtures are generated in-process so no binaries are committed.
 */

import sharp from "sharp";

// Keep in step with src/lib/embeddings/images.ts
const IMAGE_MAX_DIMENSION = 512;
const IMAGE_QUALITY = 85;

describe("sharp real-library behaviour", () => {
  it("loads the native binding with the formats production depends on", () => {
    expect(sharp.versions.vips).toBeDefined();
    expect(sharp.format.jpeg.output.buffer).toBe(true);
    expect(sharp.format.gif.output.buffer).toBe(true);
    expect(sharp.format.webp.output.buffer).toBe(true);
    expect(sharp.format.png.output.buffer).toBe(true);
  });

  describe("EXIF/GPS stripping via .rotate() — security-load-bearing", () => {
    /** A JPEG carrying GPS EXIF and a non-default orientation. */
    async function createGpsTaggedJpeg(): Promise<Buffer> {
      return sharp({
        create: {
          width: 64,
          height: 32,
          channels: 3,
          background: "#cc3333",
        },
      })
        .withExif({
          IFD0: { Make: "TestCam", Model: "X1" },
          IFD2: {
            GPSLatitudeRef: "N",
            GPSLatitude: "51/1 30/1 0/1",
            GPSLongitudeRef: "W",
            GPSLongitude: "0/1 7/1 0/1",
          },
        })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();
    }

    it("produces a fixture that actually carries GPS EXIF (guards the test itself)", async () => {
      const tagged = await createGpsTaggedJpeg();
      const metadata = await sharp(tagged).metadata();

      expect(metadata.exif).toBeDefined();
      expect(metadata.exif!.length).toBeGreaterThan(0);
      expect(metadata.orientation).toBe(6);
      expect(tagged.includes(Buffer.from("TestCam"))).toBe(true);
    });

    // Mirrors src/app/api/upload/route.ts:266 and
    // src/app/api/verification/upload/route.ts:101 exactly.
    it("strips all EXIF metadata from the output buffer", async () => {
      const processed = await sharp(await createGpsTaggedJpeg())
        .rotate()
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    });

    it("leaves no GPS or camera bytes anywhere in the output", async () => {
      const processed = await sharp(await createGpsTaggedJpeg())
        .rotate()
        .toBuffer();

      // Byte-level check: catches metadata surviving somewhere .metadata() ignores.
      expect(processed.includes(Buffer.from("GPS"))).toBe(false);
      expect(processed.includes(Buffer.from("TestCam"))).toBe(false);
      expect(processed.includes(Buffer.from("51/1"))).toBe(false);
    });

    it("still applies the EXIF orientation before discarding it", async () => {
      // Orientation 6 = rotate 90deg, so a 64x32 source must come out 32x64.
      // If sharp ever stopped honouring this, photos would silently upload sideways.
      const processed = await sharp(await createGpsTaggedJpeg())
        .rotate()
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.width).toBe(32);
      expect(metadata.height).toBe(64);
    });
  });

  describe("animated GIF handling", () => {
    const FRAME_SIZE = 16;
    const FRAME_COUNT = 3;

    /**
     * A genuinely multi-page GIF. Two details matter and both are easy to get
     * wrong: frames are stacked vertically in one raw buffer with `pageHeight`
     * marking the split, and each frame must have DIFFERENT pixel content —
     * libvips dedupes identical frames down to a single page, which silently
     * turns this into a non-animated fixture that proves nothing.
     */
    async function createAnimatedGif(): Promise<Buffer> {
      const frames = Array.from({ length: FRAME_COUNT }, (_, i) =>
        Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 3, 40 + i * 80)
      );

      return sharp(Buffer.concat(frames), {
        raw: {
          width: FRAME_SIZE,
          height: FRAME_SIZE * FRAME_COUNT,
          channels: 3,
          pageHeight: FRAME_SIZE,
        },
      })
        .gif({ loop: 0, delay: [100, 100, 100] })
        .toBuffer();
    }

    it("produces a genuinely animated fixture (guards the test itself)", async () => {
      const metadata = await sharp(await createAnimatedGif(), {
        animated: true,
      }).metadata();

      expect(metadata.pages).toBe(FRAME_COUNT);
      expect(metadata.pageHeight).toBe(FRAME_SIZE);
    });

    // Mirrors src/app/api/upload/route.ts:262-264.
    it("re-encodes an animated GIF without throwing and keeps it a GIF", async () => {
      const processed = await sharp(await createAnimatedGif(), {
        animated: true,
      })
        .gif()
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.format).toBe("gif");
      expect(processed.length).toBeGreaterThan(0);
    });

    it("preserves frame count through the animated re-encode", async () => {
      const source = await createAnimatedGif();
      const before = await sharp(source, { animated: true }).metadata();
      expect(before.pages).toBe(FRAME_COUNT);

      const processed = await sharp(source, { animated: true })
        .gif()
        .toBuffer();

      const after = await sharp(processed, { animated: true }).metadata();
      expect(after.pages).toBe(FRAME_COUNT);
    });

    it("strips metadata from the animated re-encode", async () => {
      const processed = await sharp(await createAnimatedGif(), {
        animated: true,
      })
        .gif()
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.exif).toBeUndefined();
    });
  });

  describe("embeddings pipeline", () => {
    // Mirrors src/lib/embeddings/images.ts:86-92.
    // mozjpeg is a libvips BUILD FLAG — if a prebuilt binary ever ships without
    // it, this throws or silently degrades, and nothing else would catch it.
    it("resizes and encodes with mozjpeg without throwing", async () => {
      const source = await sharp({
        create: {
          width: 1024,
          height: 768,
          channels: 3,
          background: "#228844",
        },
      })
        .jpeg()
        .toBuffer();

      const processed = await sharp(source)
        .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(metadata.width).toBe(IMAGE_MAX_DIMENSION);
      expect(metadata.height).toBe(384); // 768 * (512/1024), aspect preserved
    });

    it("does not enlarge images smaller than the target", async () => {
      const small = await sharp({
        create: { width: 64, height: 48, channels: 3, background: "#884422" },
      })
        .jpeg()
        .toBuffer();

      const processed = await sharp(small)
        .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: IMAGE_QUALITY, mozjpeg: true })
        .toBuffer();

      const metadata = await sharp(processed).metadata();
      expect(metadata.width).toBe(64);
      expect(metadata.height).toBe(48);
    });
  });

  describe("sharp 0.35 input handling", () => {
    // 0.35 introduced limitInputChannels (default 5). Production feeds sharp
    // remote/user images with no channel allowlist, so confirm the formats we
    // actually accept are not newly rejected.
    it("accepts a 4-channel RGBA PNG", async () => {
      const rgba = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();

      const processed = await sharp(rgba).rotate().toBuffer();
      const metadata = await sharp(processed).metadata();
      expect(metadata.channels).toBe(4);
    });

    it("accepts a CMYK JPEG", async () => {
      const cmyk = await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#446688" },
      })
        .jpeg()
        .toColourspace("cmyk")
        .toBuffer();

      await expect(sharp(cmyk).rotate().toBuffer()).resolves.toBeInstanceOf(
        Buffer
      );
    });
  });
});
