import { readFileSync } from "fs";
import { join } from "path";

describe("scripts/cfm/backfill-canonical-inventory booking mode mapping", () => {
  const script = readFileSync(
    join(process.cwd(), "scripts/cfm/backfill-canonical-inventory.ts"),
    "utf8"
  );

  it("selects Listing.bookingMode for canonical inventory backfills", () => {
    expect(script).toContain("bookingMode: string;");
    expect(script).toContain('l."booking_mode" AS "bookingMode"');
  });

  it("prioritizes WHOLE_UNIT booking mode before roomType fallback", () => {
    expect(script).toMatch(
      /if \(row\.bookingMode === "WHOLE_UNIT"\) return "ENTIRE_PLACE";\s*if \(row\.roomType === "Entire Place"\)/
    );
  });
});
