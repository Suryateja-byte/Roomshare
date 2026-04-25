import fs from "fs";
import path from "path";

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".sql",
  ".prisma",
]);

function walkFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (
      [".next", ".worktrees", "coverage", "node_modules", "test-output"].includes(
        entry.name
      )
    ) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function findMatches(term: string): string[] {
  const repoRoot = process.cwd();
  const searchRoots = ["src", "prisma", ".orchestrator"].map((dir) =>
    path.join(repoRoot, dir)
  );
  const matches: string[] = [];

  for (const root of searchRoots) {
    for (const file of walkFiles(root)) {
      const relative = path.relative(repoRoot, file);
      const content = fs.readFileSync(file, "utf8");
      if (content.includes(term)) {
        matches.push(relative);
      }
    }
  }

  return matches;
}

describe("Phase 01 read-path isolation", () => {
  const terms = [
    "listing_inventories",
    "ListingInventory",
    "physical_units",
    "host_unit_claims",
    "identity_mutations",
    "outbox_events",
    "cache_invalidations",
    "audit_events",
  ];

  it("keeps new table references out of app and component read paths", () => {
    for (const term of terms) {
      const hits = findMatches(term);
      const offending = hits.filter(
        (file) => file.startsWith("src/app/") || file.startsWith("src/components/")
      );
      expect(offending).toEqual([]);
    }
  });

  it("keeps Listing.physical_unit_id unread by app and component code", () => {
    const hits = findMatches("physical_unit_id");
    const offending = hits.filter(
      (file) =>
        (file.startsWith("src/app/") || file.startsWith("src/components/")) &&
        file !== "src/__tests__/integration/phase01-read-path-isolation.test.ts"
    );
    expect(offending).toEqual([]);
  });

  it("keeps isPhase01CanonicalWritesEnabled uncoupled from production callers", () => {
    const hits = findMatches("isPhase01CanonicalWritesEnabled");
    const allowed = new Set([
      "src/lib/flags/phase01.ts",
      "src/__tests__/integration/phase01-read-path-isolation.test.ts",
      "src/__tests__/lib/flags/phase01.test.ts",
    ]);

    const offending = hits.filter(
      (file) => file.startsWith("src/") && !allowed.has(file)
    );

    expect(offending).toEqual([]);
  });
});
