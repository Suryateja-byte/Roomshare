import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit } from '@/lib/with-rate-limit';
import { hashToken, isValidTokenFormat } from '@/lib/token-security';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: NextRequest) {
    // P1-1 FIX: Add rate limiting to prevent token brute-forcing
    const rateLimitResponse = await withRateLimit(request, { type: 'verifyEmail' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.redirect(new URL('/?error=missing_token', request.url));
        }
        if (!isValidTokenFormat(token)) {
            return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
        }

        const tokenHash = hashToken(token);

        // Find the verification token
        const verificationToken = await prisma.verificationToken.findUnique({
            where: { tokenHash }
        });

        if (!verificationToken) {
            return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
        }

        // Check if token is expired
        if (verificationToken.expires < new Date()) {
            // Delete expired token
            await prisma.verificationToken.delete({
                where: { tokenHash }
            });
            // Redirect to dedicated expired token page for clear UX
            return NextResponse.redirect(new URL('/verify-expired', request.url));
        }

        // Find the user by email (identifier)
        const user = await prisma.user.findUnique({
            where: { email: verificationToken.identifier }
        });

        if (!user) {
            return NextResponse.redirect(new URL('/?error=user_not_found', request.url));
        }

        // Atomic: delete token + verify user in one transaction to prevent race conditions
        try {
            await prisma.$transaction(async (tx) => {
                const deleted = await tx.verificationToken.deleteMany({ where: { tokenHash } });
                if (deleted.count === 0) throw new Error('TOKEN_ALREADY_USED');
                await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
            });
        } catch (error) {
            if (error instanceof Error && error.message === 'TOKEN_ALREADY_USED') {
                return NextResponse.redirect(new URL('/?error=already_verified', request.url));
            }
            throw error;
        }

        // Redirect to home with success message
        return NextResponse.redirect(new URL('/?verified=true', request.url));
    } catch (error) {
        logger.sync.error('Email verification error', {
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
            route: '/api/auth/verify-email',
        });
        Sentry.captureException(error);
        return NextResponse.redirect(new URL('/?error=verification_failed', request.url));
    }
}
