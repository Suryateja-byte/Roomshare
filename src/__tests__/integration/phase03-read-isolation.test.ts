/**
 * @jest-environment node
 *
 * Phase 03 remains dark: live search routes must not read the new semantic
 * projection table until Phase 04.
 */

import fs from "fs";
import path from "path";

describe("Phase 03 read isolation", () => {
  it("does not wire semantic_inventory_projection into live search services", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const liveSearchFiles = [
      "src/lib/search/search-v2-service.ts",
      "src/lib/search/search-doc-queries.ts",
      "src/app/api/search/v2/route.ts",
    ];

    for (const file of liveSearchFiles) {
      const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
      expect(text).not.toContain("semantic_inventory_projection");
    }
  });
});
