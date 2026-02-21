/**
 * Next.js middleware entry point.
 *
 * Delegates to the unified request handler in src/proxy.ts which handles:
 * - Suspension checks on protected routes
 * - CSP and security headers
 * - Request correlation (x-request-id)
 */
export { default } from './proxy';
export { config } from './proxy';
