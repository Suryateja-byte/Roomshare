import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import { withRetry } from '@/lib/retry';

export async function GET(request: NextRequest) {
    try {
        // Verify the request is from Vercel Cron
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Defense in depth: validate secret configuration
        if (!cronSecret || cronSecret.length < 32) {
            logger.sync.error('[Cron] CRON_SECRET not configured or too short (min 32 chars)');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Reject placeholder values
        if (cronSecret.includes('change-in-production') || cronSecret.startsWith('your-') || cronSecret.startsWith('generate-')) {
            logger.sync.error('[Cron] CRON_SECRET contains placeholder value');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const now = new Date();

        // Delete expired rate limit entries — with retry for transient DB errors
        const result = await withRetry(
            () => prisma.rateLimitEntry.deleteMany({
                where: {
                    expiresAt: { lt: now }
                }
            }),
            { context: 'cleanup-rate-limits' },
        );

        logger.sync.info(`[Cleanup Cron] Deleted ${result.count} expired rate limit entries`);

        return NextResponse.json({
            success: true,
            deleted: result.count,
            timestamp: now.toISOString()
        });
    } catch (error) {
        logger.sync.error('Rate limit cleanup error', {
            error: sanitizeErrorMessage(error),
        });
        Sentry.captureException(error, { tags: { cron: 'cleanup-rate-limits' } });
        return NextResponse.json(
            { error: 'Cleanup failed' },
            { status: 500 }
        );
    }
}
