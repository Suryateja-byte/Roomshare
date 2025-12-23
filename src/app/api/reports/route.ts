import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
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

        const body = await request.json();

        // P2-5: Zod validation
        const parsed = createReportSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { listingId, reason, details } = parsed.data;

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
        console.error('Error creating report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
