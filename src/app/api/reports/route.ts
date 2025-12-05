import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { listingId, reason, details } = body;

        if (!listingId || !reason) {
            return NextResponse.json({ error: 'Missing listingId or reason' }, { status: 400 });
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
        console.error('Error creating report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
