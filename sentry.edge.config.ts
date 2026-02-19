/**
 * Sentry Edge Runtime Configuration
 * Tracks errors and performance in Edge functions (middleware, edge API routes)
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment and release tracking
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Performance monitoring - sample rate for edge functions
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Explicit tags for filtering in Sentry dashboard
    initialScope: {
      tags: {
        runtime: 'edge',
        service: 'roomshare',
      },
    },

    // Filter out non-actionable errors
    beforeSend(event, hint) {
      const error = hint.originalException;

      if (error instanceof Error) {
        // Ignore expected middleware redirects
        if (error.message.includes('NEXT_REDIRECT')) {
          return null;
        }
      }

      return event;
    },
  });
}
