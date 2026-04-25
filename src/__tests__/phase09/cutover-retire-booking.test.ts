import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
}));

const repoRoot = process.cwd();

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

describe("Phase 09 booking retirement", () => {
  it("keeps active runtime code free of Booking model and booking state-machine references", () => {
    const activeFiles = trackedFiles().filter((file) => {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) return false;
      if (file.startsWith("src/__tests__/")) return false;
      if (file.startsWith("prisma/")) return false;
      if (file.startsWith(".orchestrator/")) return false;
      return (
        file.startsWith("src/") ||
        file.startsWith("scripts/") ||
        file.startsWith("tests/e2e/")
      );
    });

    const forbidden = [
      /prisma\.booking\b/,
      /prisma\.bookingAuditLog\b/,
      /BookingAuditLog\b/,
      /ListingDayInventory\b/,
      /BookingStatus\b/,
      /booking-state-machine/,
      /app\/actions\/booking/,
      /app\/actions\/manage-booking/,
      /api\/cron\/sweep-expired-holds/,
      /api\/cron\/reconcile-slots/,
    ];

    const violations = activeFiles.flatMap((file) => {
      const content = readFileSync(path.join(repoRoot, file), "utf8");
      return forbidden
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it("redirects /bookings to messages without Booking reads", async () => {
    const { auth } = await import("@/auth");
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-1" } });
    const page = await import("@/app/bookings/page");

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT:/messages");
  });

  it("redirects /admin/bookings to admin without Booking reads", async () => {
    const { auth } = await import("@/auth");
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    const page = await import("@/app/admin/bookings/page");

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT:/admin");
  });

  it("defaults Phase 01-08 flags on outside production and preserves overrides", async () => {
    const originalEnv = process.env;
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "development" };
    delete process.env.FEATURE_PHASE04_PROJECTION_READS;
    delete process.env.FEATURE_PUBLIC_CACHE_COHERENCE;

    let env = await import("@/lib/env");
    expect(env.features.phase04ProjectionReads).toBe(true);
    expect(env.features.publicCacheCoherence).toBe(true);

    process.env.FEATURE_PHASE04_PROJECTION_READS = "false";
    expect(env.features.phase04ProjectionReads).toBe(false);

    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "production" };
    delete process.env.FEATURE_PHASE04_PROJECTION_READS;
    env = await import("@/lib/env");
    expect(env.features.phase04ProjectionReads).toBe(false);

    process.env.FEATURE_PHASE04_PROJECTION_READS = "true";
    expect(env.features.phase04ProjectionReads).toBe(true);

    process.env = originalEnv;
  });
});
