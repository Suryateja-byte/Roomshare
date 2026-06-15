import { readFileSync } from "fs";
import { join } from "path";

const seedScriptPaths = [
  "scripts/seed-e2e.js",
  "scripts/seed-demo.js",
  "scripts/seed-staging.js",
  "scripts/seed-listings.js",
  "scripts/seed-test-listings.js",
];

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("seed bookingMode derivation", () => {
  it.each(seedScriptPaths)("%s derives bookingMode for direct Listing writes", (path) => {
    const script = readRepoFile(path);

    expect(script).toContain("function deriveBookingMode");
    expect(script).toContain("bookingMode");
    expect(script).toContain("deriveBookingMode(");
  });

  it("test helper derives bookingMode for direct Listing fixture writes", () => {
    const route = readRepoFile("src/app/api/test-helpers/route.ts");

    expect(route).toContain("function deriveBookingMode");
    expect(route).toContain("bookingMode: deriveBookingMode(roomType)");
  });

  it.each(["scripts/seed-e2e.js", "scripts/seed-demo.js"])(
    "%s writes effective booking_mode in raw search-doc SQL",
    (path) => {
      const script = readRepoFile(path);

      expect(script).toMatch(
        /lease_duration,\s*room_type,\s*booking_mode,\s*move_in_date/
      );
      expect(script).toContain(
        'l."booking_mode" = \'WHOLE_UNIT\' OR l."roomType" = \'Entire Place\''
      );
      expect(script).toContain("ELSE COALESCE(l.\"booking_mode\", 'SHARED')");
      expect(script).toContain("booking_mode = EXCLUDED.booking_mode");
    }
  );
});
