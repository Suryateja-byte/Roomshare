import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { processSearchAlerts } from '@/lib/search-alerts';
import { logger } from '@/lib/logger';
import { withRetry } from '@/lib/retry';

// Vercel Cron or external cron service endpoint
// Secured with CRON_SECRET in all environments
export async function GET(request: NextRequest) {
    // Verify authorization - required in all environments
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

    try {
        logger.sync.info('Starting search alerts processing...');
        const startTime = Date.now();

        const result = await withRetry(
            () => processSearchAlerts(),
            { context: 'processSearchAlerts' },
        );

        const duration = Date.now() - startTime;
        logger.sync.info(`Search alerts completed in ${duration}ms`, { ...result, duration });

        return NextResponse.json({
            success: true,
            duration: `${duration}ms`,
            ...result
        });

    } catch (error) {
        logger.sync.error('Search alerts cron error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        Sentry.captureException(error, { tags: { cron: 'search-alerts' } });
        return NextResponse.json(
            { success: false, error: 'Search alerts processing failed' },
            { status: 500 }
        );
    }
}
