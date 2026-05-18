import fs from "node:fs";
import path from "node:path";

describe("scripts/seed-e2e freshness guards", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "scripts/seed-e2e.js"),
    "utf8"
  );

  it("refreshes lastConfirmedAt for upserted E2E listings", () => {
    expect(source).toContain("function freshLastConfirmedAt()");
    expect(source).toContain("const lastConfirmedAt = freshLastConfirmedAt();");
    expect(source).toMatch(
      /update:\s*{[\s\S]*lastConfirmedAt: lastConfirmedAt/
    );
    expect(source).toMatch(
      /create:\s*{[\s\S]*lastConfirmedAt: lastConfirmedAt/
    );
  });

  it("refreshes the manually managed reviewer projection fixture", () => {
    expect(source).toMatch(
      /reviewerListing = await prisma\.listing\.update\({[\s\S]*lastConfirmedAt: freshLastConfirmedAt\(\)/
    );
    expect(source).toMatch(
      /reviewerListing = await prisma\.listing\.create\({[\s\S]*openSlots: REVIEWER_LISTING\.openSlots[\s\S]*lastConfirmedAt: freshLastConfirmedAt\(\)/
    );
  });

  it("indexes SF projection fixtures by neighborhood-level public areas", () => {
    expect(source).toContain("publicAreaName: 'Mission District'");
    expect(source).toContain("publicAreaName: 'Outer Sunset'");
    expect(source).toContain("publicAreaName: 'Inner Sunset'");
    expect(source).toContain(
      "const areaName = seed.publicAreaName || seed.city || 'San Francisco';"
    );
  });
});
