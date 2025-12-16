/**
 * Structured logging utility for production observability
 * Outputs JSON logs compatible with log aggregation services
 */

import { getRequestContext } from './request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  service: string;
  environment: string;
  version?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level based on environment
const MIN_LOG_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatLogEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): LogEntry {
  const context = getRequestContext();

  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId: context?.requestId,
    userId: context?.userId,
    service: 'roomshare',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    ...meta,
  };
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry = formatLogEntry(level, message, meta);

  // In production, output JSON for log aggregation
  // In development, use human-readable format
  if (process.env.NODE_ENV === 'production') {
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  } else {
    // Development: human-readable format
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const contextInfo = entry.requestId ? ` [${entry.requestId}]` : '';
    const userInfo = entry.userId ? ` [user:${entry.userId}]` : '';

    switch (level) {
      case 'error':
        console.error(`${prefix}${contextInfo}${userInfo}`, message, meta || '');
        break;
      case 'warn':
        console.warn(`${prefix}${contextInfo}${userInfo}`, message, meta || '');
        break;
      case 'debug':
        console.debug(`${prefix}${contextInfo}${userInfo}`, message, meta || '');
        break;
      default:
        console.log(`${prefix}${contextInfo}${userInfo}`, message, meta || '');
    }
  }
}

/**
 * Structured logger with request context correlation
 *
 * @example
 * ```ts
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Failed to send email', { error: err.message, to: email });
 * logger.warn('Rate limit approaching', { current: 90, max: 100 });
 * ```
 */
export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),

  /**
   * Log with custom level
   */
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) =>
    log(level, message, meta),

  /**
   * Create a child logger with preset metadata
   * Useful for adding context to all logs in a function
   */
  child: (defaultMeta: Record<string, unknown>) => ({
    debug: (message: string, meta?: Record<string, unknown>) =>
      log('debug', message, { ...defaultMeta, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      log('info', message, { ...defaultMeta, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log('warn', message, { ...defaultMeta, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      log('error', message, { ...defaultMeta, ...meta }),
  }),
};
