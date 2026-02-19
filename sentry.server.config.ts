/**
 * Sentry Server-Side Configuration
 * Tracks errors and performance on the server (Node.js runtime)
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment and release tracking
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Performance monitoring - lower sample rate in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling for performance analysis
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // Filter out known non-actionable errors
    beforeSend(event, hint) {
      const error = hint.originalException;

      if (error instanceof Error) {
        // Ignore timeout errors from external services (we handle these gracefully)
        if (error.name === 'FetchTimeoutError') {
          return null;
        }

        // Ignore expected auth errors
        if (error.message.includes('NEXT_REDIRECT')) {
          return null;
        }
      }

      return event;
    },

    // Ignore specific transactions for performance monitoring
    beforeSendTransaction(event) {
      // Don't track health check endpoints
      if (event.transaction?.includes('/api/health')) {
        return null;
      }
      return event;
    },

    // Server-specific integrations
    integrations: [
      Sentry.prismaIntegration(),
    ],

    // Explicit tags for filtering in Sentry dashboard
    initialScope: {
      tags: {
        runtime: 'nodejs',
        service: 'roomshare',
      },
    },
  });
}
