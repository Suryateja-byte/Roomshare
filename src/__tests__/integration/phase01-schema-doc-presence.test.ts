import fs from "fs";
import path from "path";

describe("Phase 01 migration docs", () => {
  it("ships README files with rollback guidance for each migration", () => {
    const migrationDirs = [
      "20260501000000_phase01_canonical_identity_tables",
      "20260501010000_phase01_moderation_precedence_trigger",
      "20260501020000_phase01_add_listing_physical_unit_id",
    ];

    for (const dir of migrationDirs) {
      const readme = fs.readFileSync(
        path.join(process.cwd(), "prisma/migrations", dir, "README.md"),
        "utf8"
      );

      expect(readme).toContain("## Rollback");
      expect(readme).toContain("## Data-safety");
      expect(readme).toContain("## Lock footprint");
    }
  });
});
