import "server-only";

import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "./logger";
import { extractPrismaEventMeta } from "./prisma-log";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const FALLBACK_DATABASE_URL =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public";

// P2-15: Connection pool configuration for serverless environments
// Vercel serverless functions have short lifecycles, so we need to optimize connection handling
// - connection_limit: Max connections per function instance (keep low for serverless)
// - pool_timeout: How long to wait for a connection (fail fast in serverless)
// - connect_timeout: Time to establish a new connection
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
const getDatasourceUrl = () => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    // Allow build-time static generation (no DB needed for prerendering)
    // NEXT_PHASE is set by Next.js during `next build`
    if (process.env.NODE_ENV === "test" || process.env.NEXT_PHASE) {
      return FALLBACK_DATABASE_URL;
    }

    const message =
      "DATABASE_URL is not configured. Refusing to start Prisma outside test environment.";
    logger.sync.error(message);
    throw new Error(message);
  }

  // Only add connection params if not already present
  if (baseUrl.includes("connection_limit")) return baseUrl;

  const separator = baseUrl.includes("?") ? "&" : "?";
  // Lower limits for serverless: 5 connections max, 10s pool timeout, 5s connect timeout
  return `${baseUrl}${separator}connection_limit=5&pool_timeout=10&connect_timeout=5`;
};

// P3-03 FIX: Configure Prisma logging
// Development: log queries to stdout, errors/warnings via events for structured logging
// Production: log errors/warnings via events only for structured logging with correlation
type LogConfig = Prisma.PrismaClientOptions["log"];

const getLogConfig = (): LogConfig => {
  if (process.env.NODE_ENV === "development") {
    return [
      { emit: "stdout", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ];
  }
  // Production: route all through structured logger + detect slow queries
  return [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
    { emit: "event", level: "query" },
  ];
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: getLogConfig(),
    datasources: {
      db: {
        url: getDatasourceUrl(),
      },
    },
  });

  // Route Prisma errors/warnings through structured logger for correlation
  // This provides requestId, userId context and PII redaction
  // Using type assertion since $on is available when log emit is 'event'
  const extendedClient = client as PrismaClient & {
    $on: {
      (
        eventType: "error" | "warn",
        callback: (event: {
          message: string;
          target: string;
          timestamp: Date;
        }) => void
      ): void;
      (
        eventType: "query",
        callback: (event: {
          query: string;
          params: string;
          duration: number;
          target: string;
          timestamp: Date;
        }) => void
      ): void;
    };
  };

  extendedClient.$on("error", (e) => {
    logger.sync.error("Prisma error", extractPrismaEventMeta(e as unknown));
  });

  extendedClient.$on("warn", (e) => {
    logger.sync.warn("Prisma warning", extractPrismaEventMeta(e as unknown));
  });

  // Slow query detection: log queries exceeding 1 second
  // Query events are emitted for all queries; we filter to only warn on slow ones
  const SLOW_QUERY_THRESHOLD_MS = 1000;
  extendedClient.$on("query", (e) => {
    if (e.duration >= SLOW_QUERY_THRESHOLD_MS) {
      logger.sync.warn("Slow database query", {
        durationMs: e.duration,
        query: e.query,
        target: e.target,
        timestamp: e.timestamp.toISOString(),
        // e.params intentionally omitted — may contain user PII
      });
    }
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Cache on globalThis to prevent connection churn across warm invocations
globalForPrisma.prisma = prisma;
