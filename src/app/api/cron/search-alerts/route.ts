import { NextRequest, NextResponse } from 'next/server';
import { processSearchAlerts } from '@/lib/search-alerts';

// Vercel Cron or external cron service endpoint
// Secured with CRON_SECRET in all environments
export async function GET(request: NextRequest) {
    // Verify authorization - required in all environments
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('CRON_SECRET not configured. Set this in your environment variables.');
        return NextResponse.json(
            { error: 'Server configuration error: CRON_SECRET not set' },
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
        console.log('Starting search alerts processing...');
        const startTime = Date.now();

        const result = await processSearchAlerts();

        const duration = Date.now() - startTime;
        console.log(`Search alerts completed in ${duration}ms:`, result);

        return NextResponse.json({
            success: true,
            duration: `${duration}ms`,
            ...result
        });

    } catch (error) {
        console.error('Search alerts cron error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
    return GET(request);
}
