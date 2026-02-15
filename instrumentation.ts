/**
 * Next.js Instrumentation Hook
 * Initializes monitoring, tracing, and shutdown handlers for the application
 *
 * This file is automatically loaded by Next.js at startup
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Initialize Sentry based on runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Register graceful shutdown handlers (Node.js only)
    // This ensures Sentry events are flushed and Prisma disconnects cleanly
    const { registerShutdownHandlers } = await import('./src/lib/shutdown');
    registerShutdownHandlers();

    // Log warnings for missing optional services at startup
    const { logStartupWarnings } = await import('./src/lib/env');
    logStartupWarnings();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
    // Edge runtime doesn't support process signals
  }
}
