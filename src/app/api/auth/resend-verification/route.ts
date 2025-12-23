import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { sendNotificationEmail } from '@/lib/email';
import { withRateLimit } from '@/lib/with-rate-limit';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
    // Rate limit: 3 resend requests per hour
    const rateLimitResponse = await withRateLimit(request, { type: 'resendVerification' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { error: 'You must be logged in to resend verification email' },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        if (user.emailVerified) {
            return NextResponse.json(
                { error: 'Email is already verified' },
                { status: 400 }
            );
        }

        // Delete any existing verification tokens for this email
        await prisma.verificationToken.deleteMany({
            where: { identifier: user.email! }
        });

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.verificationToken.create({
            data: {
                identifier: user.email!,
                token: verificationToken,
                expires,
            },
        });

        // Build verification URL
        const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

        // Send verification email
        await sendNotificationEmail('emailVerification', user.email!, {
            userName: user.name || 'User',
            verificationUrl
        });

        return NextResponse.json({
            message: 'Verification email sent successfully'
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        return NextResponse.json(
            { error: 'Failed to send verification email' },
            { status: 500 }
        );
    }
}
