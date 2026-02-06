import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

const getCachedListings = unstable_cache(
  async () => {
    return prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  },
  ['sitemap-listings'],
  { revalidate: 3600 }
);

const getCachedUsers = unstable_cache(
  async () => {
    return prisma.user.findMany({
      where: { isSuspended: false },
      select: { id: true, createdAt: true },
    });
  },
  ['sitemap-users'],
  { revalidate: 3600 }
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://roomshare.app';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  const [listings, users] = await Promise.all([
    getCachedListings(),
    getCachedUsers(),
  ]);

  const listingPages: MetadataRoute.Sitemap = listings.map((listing) => ({
    url: `${baseUrl}/listings/${listing.id}`,
    lastModified: listing.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const userPages: MetadataRoute.Sitemap = users.map((user) => ({
    url: `${baseUrl}/users/${user.id}`,
    lastModified: user.createdAt,
    changeFrequency: 'weekly' as const,
    priority: 0.4,
  }));

  return [...staticPages, ...listingPages, ...userPages];
}
