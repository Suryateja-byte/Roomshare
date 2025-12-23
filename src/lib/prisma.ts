import { PrismaClient, Prisma } from '@prisma/client'
import { logger } from './logger'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

// P2-15: Connection pool configuration for serverless environments
// Vercel serverless functions have short lifecycles, so we need to optimize connection handling
// - connection_limit: Max connections per function instance (keep low for serverless)
// - pool_timeout: How long to wait for a connection (fail fast in serverless)
// - connect_timeout: Time to establish a new connection
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
const getDatasourceUrl = () => {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) return baseUrl;

    // Only add connection params if not already present
    if (baseUrl.includes('connection_limit')) return baseUrl;

    const separator = baseUrl.includes('?') ? '&' : '?';
    // Lower limits for serverless: 5 connections max, 10s pool timeout, 5s connect timeout
    return `${baseUrl}${separator}connection_limit=5&pool_timeout=10&connect_timeout=5`;
};

// P3-03 FIX: Configure Prisma logging
// Development: log queries to stdout, errors/warnings via events for structured logging
// Production: log errors/warnings via events only for structured logging with correlation
type LogConfig = Prisma.PrismaClientOptions['log'];

const getLogConfig = (): LogConfig => {
    if (process.env.NODE_ENV === 'development') {
        return [
            { emit: 'stdout', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
        ];
    }
    // Production: route all through structured logger
    return [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
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

    // P3-03 FIX: Route Prisma errors through structured logger for correlation
    // This provides requestId, userId context and PII redaction
    // Using type assertion since $on is available when log emit is 'event'
    const extendedClient = client as PrismaClient & {
        $on: (eventType: 'error' | 'warn', callback: (event: { message: string; target: string; timestamp: Date }) => void) => void;
    };

    extendedClient.$on('error', (e) => {
        logger.sync.error('Prisma error', {
            target: e.target,
            message: e.message,
            timestamp: e.timestamp.toISOString(),
        });
    });

    extendedClient.$on('warn', (e) => {
        logger.sync.warn('Prisma warning', {
            target: e.target,
            message: e.message,
            timestamp: e.timestamp.toISOString(),
        });
    });

    return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Prevent multiple instances in development (hot reload)
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
