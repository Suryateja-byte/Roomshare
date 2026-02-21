import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import { captureApiError } from '@/lib/api-error-handler';
import { z } from 'zod';

// P2-5: Zod schema for request validation
const createReportSchema = z.object({
    listingId: z.string().min(1, 'listingId is required').max(100),
    reason: z.string().min(1, 'reason is required').max(100),
    details: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
    // P2-5: Add rate limiting to prevent report spam
    const rateLimitResponse = await withRateLimit(request, { type: 'createReport' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body;
        try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

        // P2-5: Zod validation
        const parsed = createReportSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { listingId, reason, details } = parsed.data;

        // BIZ-05: Block self-reporting — look up listing owner
        const listing = await prisma.listing.findUnique({
            where: { id: listingId },
            select: { ownerId: true },
        });

        if (!listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
        }

        if (listing.ownerId === session.user.id) {
            return NextResponse.json({ error: 'You cannot report your own listing' }, { status: 400 });
        }

        // Check for existing active report (duplicate prevention)
        // Allow re-report only if previous report was DISMISSED
        const existingReport = await prisma.report.findFirst({
            where: {
                reporterId: session.user.id,
                listingId,
                status: { in: ['OPEN', 'RESOLVED'] } // Allow re-report if DISMISSED
            }
        });

        if (existingReport) {
            return NextResponse.json(
                { error: 'You have already reported this listing. Your report is being reviewed.' },
                { status: 409 }
            );
        }

        const report = await prisma.report.create({
            data: {
                listingId,
                reporterId: session.user.id,
                reason,
                details
            }
        });

        return NextResponse.json(report);
    } catch (error) {
        return captureApiError(error, { route: '/api/reports', method: 'POST' });
    }
}
