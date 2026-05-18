import fs from "node:fs";
import path from "node:path";

type SeedManifest = {
  listingsByTitle?: Record<string, string>;
};

const manifestPath = path.resolve(
  process.cwd(),
  "playwright/.cache/e2e-seed.json"
);

export function seedListingId(title: string): string | null {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    ) as SeedManifest;
    return manifest.listingsByTitle?.[title] ?? null;
  } catch {
    return null;
  }
}
