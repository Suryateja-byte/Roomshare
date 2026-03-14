/**
 * Next.js Instrumentation Hook
 * Initializes monitoring, tracing, and shutdown handlers for the application
 *
 * This file is automatically loaded by Next.js at startup
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  const isSentryEnabled =
    process.env.NODE_ENV === 'production' ||
    process.env.SENTRY_ENABLE_IN_DEV === '1';

  // Initialize Sentry based on runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (isSentryEnabled) {
      await import('./sentry.server.config');
    }

    // Register graceful shutdown handlers (Node.js only)
    // This ensures Sentry events are flushed and Prisma disconnects cleanly
    const { registerShutdownHandlers } = await import('./src/lib/shutdown');
    registerShutdownHandlers();

    // Log warnings for missing optional services at startup
    const { logStartupWarnings } = await import('./src/lib/env');
    logStartupWarnings();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    if (isSentryEnabled) {
      await import('./sentry.edge.config');
    }
    // Edge runtime doesn't support process signals
  }
}
