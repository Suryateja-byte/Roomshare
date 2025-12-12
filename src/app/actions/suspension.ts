'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function checkSuspension(): Promise<{ suspended: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { suspended: false }; // Let auth checks handle this
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isSuspended: true }
    });

    if (user?.isSuspended) {
        return { suspended: true, error: 'Account suspended' };
    }

    return { suspended: false };
}

export async function checkEmailVerified(): Promise<{ verified: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { verified: false }; // Let auth checks handle this
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { emailVerified: true }
    });

    if (!user?.emailVerified) {
        return { verified: false, error: 'Please verify your email to continue' };
    }

    return { verified: true };
}
