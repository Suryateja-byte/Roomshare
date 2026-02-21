import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUnreadMessageCount } from '@/app/actions/chat';
import { withRateLimit } from '@/lib/with-rate-limit';
import { captureApiError } from '@/lib/api-error-handler';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
    // P2-6: Add rate limiting to prevent excessive polling
    const rateLimitResponse = await withRateLimit(request, { type: 'unreadCount' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const count = await getUnreadMessageCount();

        // P2-6: Replace debug console.log with structured logger (only in dev)
        if (process.env.NODE_ENV === 'development') {
            logger.sync.debug('Unread count fetched', {
                userId: session.user.id.slice(0, 8) + '...',
                count,
            });
        }

        const response = NextResponse.json({ count });
        // PERF-01: Short cache — unread badge doesn't need real-time accuracy
        response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
        return response;
    } catch (error) {
        return captureApiError(error, { route: '/api/messages/unread', method: 'GET' });
    }
}
