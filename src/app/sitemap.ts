import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

const URLS_PER_SITEMAP = 5000;

const STATIC_PAGES = [
  { path: '', changeFrequency: 'daily' as const, priority: 1.0 },
  { path: '/search', changeFrequency: 'hourly' as const, priority: 0.9 },
  { path: '/about', changeFrequency: 'monthly' as const, priority: 0.5 },
  { path: '/terms', changeFrequency: 'monthly' as const, priority: 0.3 },
  { path: '/privacy', changeFrequency: 'monthly' as const, priority: 0.3 },
  { path: '/signup', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/login', changeFrequency: 'monthly' as const, priority: 0.5 },
];

export async function generateSitemaps() {
  const [listingCount, userCount] = await Promise.all([
    prisma.listing.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { isSuspended: false } }),
  ]);

  const totalUrls = listingCount + userCount + STATIC_PAGES.length;
  const sitemapCount = Math.max(1, Math.ceil(totalUrls / URLS_PER_SITEMAP));

  return Array.from({ length: sitemapCount }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://roomshare.app';
  const offset = id * URLS_PER_SITEMAP;
  const entries: MetadataRoute.Sitemap = [];

  // Static pages only appear in sitemap 0
  const staticCount = STATIC_PAGES.length;
  if (id === 0) {
    const now = new Date();
    for (const page of STATIC_PAGES) {
      entries.push({
        url: `${baseUrl}${page.path}`,
        lastModified: now,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
      });
    }
  }

  // Calculate the dynamic offset accounting for static pages in sitemap 0
  const dynamicOffset = id === 0 ? 0 : offset - staticCount;
  const dynamicLimit = id === 0 ? URLS_PER_SITEMAP - staticCount : URLS_PER_SITEMAP;

  // Count listings to know how to split between listings and users
  const listingCount = await prisma.listing.count({ where: { status: 'ACTIVE' } });

  let remaining = dynamicLimit;

  // Fetch listings if the offset falls within listing range
  if (dynamicOffset < listingCount && remaining > 0) {
    const listingSkip = dynamicOffset;
    const listingTake = Math.min(remaining, listingCount - dynamicOffset);

    const listings = await prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: listingSkip,
      take: listingTake,
    });

    for (const listing of listings) {
      entries.push({
        url: `${baseUrl}/listings/${listing.id}`,
        lastModified: listing.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    remaining -= listings.length;
  }

  // Fetch users if there's remaining capacity and offset extends past listings
  if (remaining > 0) {
    const userOffset = Math.max(0, dynamicOffset - listingCount);
    const users = await prisma.user.findMany({
      where: { isSuspended: false },
      select: { id: true, createdAt: true },
      skip: userOffset,
      take: remaining,
    });

    for (const user of users) {
      entries.push({
        url: `${baseUrl}/users/${user.id}`,
        lastModified: user.createdAt,
        changeFrequency: 'weekly',
        priority: 0.4,
      });
    }
  }

  return entries;
}
