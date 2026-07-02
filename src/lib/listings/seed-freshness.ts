import { prisma } from "@/lib/prisma";
import { markListingsDirtyInTx } from "@/lib/search/search-doc-dirty";

/**
 * Keep seed/demo listings from aging out of the 21-day host-managed freshness
 * window (`lastConfirmedAt`) that gates public search eligibility.
 *
 * Real hosts confirm availability themselves; seed data has no host, so on a
 * demo deployment the entire inventory silently disappears from search 21 days
 * after seeding (observed in prod on 2026-07-01). This task re-stamps
 * `lastConfirmedAt` for listings owned by allowlisted seed-account domains
 * once they get within range of the cutoff.
 *
 * Scope guards:
 * - Only owners whose email domain is in SEED_FRESHNESS_OWNER_DOMAINS
 *   (default: roomshare.dev) — real hosts are never touched.
 * - Only ACTIVE listings already older than the refresh threshold.
 * - Explicit opt-in via ENABLE_SEED_FRESHNESS_REFRESH=true (see env.ts);
 *   intended for demo/staging deployments running on seed data only.
 */
const REFRESH_AFTER_DAYS = 14;

export function getSeedOwnerDomains(): string[] {
  const raw = process.env.SEED_FRESHNESS_OWNER_DOMAINS || "roomshare.dev";
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export async function refreshSeedListingFreshness(): Promise<{
  refreshed: number;
}> {
  const domains = getSeedOwnerDomains();
  if (domains.length === 0) {
    return { refreshed: 0 };
  }

  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const refreshed = await prisma.$transaction(async (tx) => {
    const stale = await tx.listing.findMany({
      where: {
        status: "ACTIVE",
        lastConfirmedAt: { lt: cutoff },
        owner: {
          OR: domains.map((domain) => ({
            email: { endsWith: `@${domain}`, mode: "insensitive" as const },
          })),
        },
      },
      select: { id: true },
    });

    if (stale.length === 0) {
      return 0;
    }

    const ids = stale.map((listing) => listing.id);
    await tx.listing.updateMany({
      where: { id: { in: ids } },
      data: { lastConfirmedAt: new Date() },
    });
    await markListingsDirtyInTx(tx, ids, "listing_updated");

    return ids.length;
  });

  return { refreshed };
}
