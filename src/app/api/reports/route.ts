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
