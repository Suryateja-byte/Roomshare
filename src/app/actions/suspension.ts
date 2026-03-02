'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function checkSuspension(userId?: string): Promise<{ suspended: boolean; error?: string }> {
    const uid = userId ?? (await auth())?.user?.id;
    if (!uid) {
        return { suspended: false }; // Let auth checks handle this
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: uid },
            select: { isSuspended: true }
        });

        if (user?.isSuspended) {
            return { suspended: true, error: 'Account suspended' };
        }

        return { suspended: false };
    } catch {
        // Fail closed: if we can't verify suspension status, block the action
        return { suspended: true, error: 'Unable to verify account status' };
    }
}

export async function checkEmailVerified(userId?: string): Promise<{ verified: boolean; error?: string }> {
    const uid = userId ?? (await auth())?.user?.id;
    if (!uid) {
        return { verified: false }; // Let auth checks handle this
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: uid },
            select: { emailVerified: true }
        });

        if (!user?.emailVerified) {
            return { verified: false, error: 'Please verify your email to continue' };
        }

        return { verified: true };
    } catch {
        // Fail closed: if we can't verify email status, block the action
        return { verified: false, error: 'Unable to verify email status' };
    }
}
