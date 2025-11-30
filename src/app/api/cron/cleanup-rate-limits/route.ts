import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        // Verify the request is from Vercel Cron
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
