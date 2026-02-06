import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://roomshare.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/settings/',
          '/bookings/',
          '/messages/',
          '/notifications/',
          '/profile/edit/',
          '/saved/',
          '/saved-searches/',
          '/recently-viewed/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
