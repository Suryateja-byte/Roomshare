import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        // Verify the request is from Vercel Cron
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Defense in depth: validate secret configuration
        if (!cronSecret || cronSecret.length < 32) {
            console.error('[Cron] CRON_SECRET not configured or too short (min 32 chars)');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Reject placeholder values
        if (cronSecret.includes('change-in-production') || cronSecret.startsWith('your-') || cronSecret.startsWith('generate-')) {
            console.error('[Cron] CRON_SECRET contains placeholder value');
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

        // Delete expired rate limit entries
        const result = await prisma.rateLimitEntry.deleteMany({
            where: {
                expiresAt: { lt: now }
            }
        });

        console.log(`[Cleanup Cron] Deleted ${result.count} expired rate limit entries`);

        return NextResponse.json({
            success: true,
            deleted: result.count,
            timestamp: now.toISOString()
        });
    } catch (error) {
        console.error('Rate limit cleanup error:', error);
        return NextResponse.json(
            { error: 'Cleanup failed' },
            { status: 500 }
        );
    }
}
