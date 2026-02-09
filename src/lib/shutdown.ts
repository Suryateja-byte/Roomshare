/**
 * Graceful Shutdown Handler
 *
 * Handles cleanup on process termination signals (SIGTERM, SIGINT).
 * Compatible with Vercel serverless functions which have ~10 seconds for graceful shutdown.
 *
 * Features:
 * - Flushes Sentry events before exit
 * - Disconnects Prisma database connections
 * - Signals draining state to health checks
 * - Prevents duplicate shutdown handling
 */

// Shutdown state
let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

/**
 * Check if the application is in shutdown mode.
 * Used by health checks to return 503 and stop accepting new traffic.
 */
export function isInShutdownMode(): boolean {
  return isShuttingDown;
}

/**
 * Wait for shutdown to complete (if in progress).
 * Useful for graceful request completion.
 */
export async function waitForShutdown(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise;
  }
}

/**
 * Perform graceful shutdown sequence:
 * 1. Mark as shutting down (health checks will return 503)
 * 2. Flush Sentry events
 * 3. Disconnect Prisma
 * 4. Exit process
 */
async function performShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Shutdown] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

  const startTime = Date.now();
  const SHUTDOWN_TIMEOUT = 8000; // 8 seconds (Vercel gives ~10s)

  shutdownPromise = (async () => {
    try {
      // 1. Flush Sentry events (if available)
      try {
        const Sentry = await import('@sentry/nextjs');
        console.log('[Shutdown] Flushing Sentry events...');
        await Promise.race([
          Sentry.close(2000), // 2 second timeout for Sentry
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
        console.log('[Shutdown] Sentry flush complete');
      } catch {
        // Sentry may not be initialized or available
      }

      // 2. Disconnect Prisma (if singleton exists)
      try {
        const { prisma } = await import('./prisma');
        console.log('[Shutdown] Disconnecting Prisma...');
        await Promise.race([
          prisma.$disconnect(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        console.log('[Shutdown] Prisma disconnected');
      } catch {
        // Prisma may not be initialized
      }

      const duration = Date.now() - startTime;
      console.log(`[Shutdown] Graceful shutdown complete in ${duration}ms`);
    } catch (error) {
      console.error('[Shutdown] Error during shutdown:', error);
    }
  })();

  // Set a maximum timeout to force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error(`[Shutdown] Timeout after ${SHUTDOWN_TIMEOUT}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT).unref();

  await shutdownPromise;
}

/**
 * Register shutdown handlers for process signals.
 * Call this once during application startup (in instrumentation.ts).
 *
 * Only works in Node.js runtime (not Edge).
 */
export function registerShutdownHandlers(): void {
  // Only register in Node.js runtime (not Edge)
  if (typeof process === 'undefined' || !process.on) {
    console.log('[Shutdown] Not in Node.js environment, skipping handler registration');
    return;
  }

  // Prevent duplicate registration across hot reloads
  const SHUTDOWN_REGISTERED = Symbol.for('roomshare.shutdown.registered');
  const globalWithShutdown = globalThis as typeof globalThis & {
    [key: symbol]: boolean;
  };

  if (globalWithShutdown[SHUTDOWN_REGISTERED]) {
    return;
  }
  globalWithShutdown[SHUTDOWN_REGISTERED] = true;

  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  for (const signal of signals) {
    process.on(signal, async () => {
      await performShutdown(signal);
      process.exit(0);
    });
  }

  // Handle SIGUSR2 for nodemon restarts
  process.on('SIGUSR2', async () => {
    await performShutdown('SIGUSR2');
    process.kill(process.pid, 'SIGUSR2');
  });

  // Handle uncaught exceptions - log and exit (ignore benign connection resets)
  process.on('uncaughtException', async (error) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EPIPE') {
      // Benign: client disconnected mid-request (e.g. browser navigation)
      return;
    }
    console.error('[Shutdown] Uncaught exception:', error);
    await performShutdown('uncaughtException');
    process.exit(1);
  });

  // Handle unhandled promise rejections - fail fast after graceful shutdown.
  // Ignore benign disconnect-style errors.
  process.on('unhandledRejection', async (reason) => {
    const code = (reason as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EPIPE') {
      return;
    }

    console.error('[Shutdown] Unhandled rejection:', reason);
    await performShutdown('unhandledRejection');
    process.exit(1);
  });

  console.log('[Shutdown] Handlers registered for: SIGTERM, SIGINT, SIGUSR2');
}
