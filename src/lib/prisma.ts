import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

// Configure Prisma logging
// Development: log queries, errors, and warnings for debugging
// Production: log errors and warnings for operational visibility
const prismaLogConfig = process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn'] as const
    : ['error', 'warn'] as const;

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: prismaLogConfig.map(level => ({
            emit: 'stdout' as const,
            level,
        })),
    })

// Prevent multiple instances in development (hot reload)
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
