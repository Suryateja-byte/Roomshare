/**
 * Sentry Client-Side Configuration
 * Tracks errors and performance in the browser
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Environment and release tracking
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay for debugging user issues (sample 10% of sessions)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Integrations
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.browserTracingIntegration(),
    ],

    // Filter out known non-actionable errors
    beforeSend(event, hint) {
      const error = hint?.originalException;

      // Skip cancelled/aborted requests (DOMException or plain Error)
      if (error instanceof DOMException && error.name === 'AbortError') return null;

      if (error instanceof Error) {
        // Skip abort/cancel by name (covers fetch AbortController and other cancellations)
        if (error.name === 'AbortError' || error.name === 'CancelledError') return null;
        // Skip dynamic import failures (usually transient network issues)
        if (error.message?.includes('ChunkLoadError')) return null;
        // Skip ResizeObserver loop errors (benign browser noise)
        if (error.message?.includes('ResizeObserver loop')) return null;
        // Note: "Failed to fetch" / "Load failed" are NOT filtered here.
        // They can indicate real API failures and should be reported to Sentry.
      }

      return event;
    },

    // Don't send PII in production
    sendDefaultPii: false,
  });
}
