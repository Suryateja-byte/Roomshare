import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Internal endpoint for middleware live suspension checks.
 * Protected by shared secret header to prevent public abuse.
 */
export async function GET(request: NextRequest) {
    const expectedSecret = process.env.SUSPENSION_CHECK_SECRET || process.env.NEXTAUTH_SECRET;
    const providedSecret = request.headers.get('x-suspension-check-secret');

    if (!expectedSecret || providedSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isSuspended: true },
        });

        return NextResponse.json({
            isSuspended: Boolean(user?.isSuspended),
        });
    } catch {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export const runtime = 'nodejs';
