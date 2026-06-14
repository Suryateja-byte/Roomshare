import { readFileSync } from "fs";
import { join } from "path";

describe("src/scripts/backfill-search-docs booking mode projection", () => {
  const script = readFileSync(
    join(process.cwd(), "src/scripts/backfill-search-docs.ts"),
    "utf8"
  );

  it("selects Listing.bookingMode for search-doc backfills", () => {
    expect(script).toContain("bookingMode: string;");
    expect(script).toContain('l."booking_mode" as "bookingMode"');
  });

  it("upserts booking_mode into listing_search_docs", () => {
    expect(script).toMatch(
      /lease_duration,\s*room_type,\s*booking_mode,\s*move_in_date/
    );
    expect(script).toMatch(
      /\$\{listing\.leaseDuration\},\s*\$\{listing\.roomType\},\s*\$\{listing\.bookingMode\},\s*\$\{listing\.moveInDate\}/
    );
    expect(script).toContain("booking_mode = EXCLUDED.booking_mode");
  });
});
