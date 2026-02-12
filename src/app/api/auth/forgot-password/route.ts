import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNotificationEmail } from '@/lib/email';
import { withRateLimit } from '@/lib/with-rate-limit';
import { normalizeEmail } from '@/lib/normalize-email';
import { createTokenPair } from '@/lib/token-security';
import { verifyTurnstileToken } from '@/lib/turnstile';

export async function POST(request: NextRequest) {
    // Rate limit: 3 password reset requests per hour per IP
    const rateLimitResponse = await withRateLimit(request, { type: 'forgotPassword' });
    if (rateLimitResponse) return rateLimitResponse;

    if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
        return NextResponse.json(
            { error: 'Password reset is temporarily unavailable' },
            { status: 503 }
        );
    }

    try {
        const { email, turnstileToken } = await request.json();

        // Verify Turnstile token before processing
        const turnstileResult = await verifyTurnstileToken(turnstileToken);
        if (!turnstileResult.success) {
            return NextResponse.json(
                { error: 'Bot verification failed. Please try again.' },
                { status: 403 }
            );
        }

        if (!email) {
            return NextResponse.json(
                { error: 'Email is required' },
                { status: 400 }
            );
        }

        const normalizedEmail = normalizeEmail(email);

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        // Always return success to prevent email enumeration attacks
        if (!user) {
            return NextResponse.json({
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Delete any existing reset tokens for this email
        await prisma.passwordResetToken.deleteMany({
            where: { email: normalizedEmail }
        });

        // Generate reset token and store only SHA-256 hash
        const { token, tokenHash } = createTokenPair();

        // Token expires in 1 hour
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        // Save the token
        await prisma.passwordResetToken.create({
            data: {
                email: normalizedEmail,
                tokenHash,
                expires
            }
        });

        // In a production app, you would send an email here
        // For now, we'll log the reset link (in development) and return success
        const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

        // Log in development only
        if (process.env.NODE_ENV === 'development') {
            console.log('Password reset link:', resetUrl);
        }

        // Send password reset email
        const emailResult = await sendNotificationEmail('passwordReset', normalizedEmail, {
            userName: user.name || 'User',
            resetLink: resetUrl
        });
        if (!emailResult.success) {
            console.error('Failed to send password reset email:', emailResult.error);
        }

        return NextResponse.json({
            message: 'If an account with that email exists, a password reset link has been sent.',
            // Only include in development for testing
            ...(process.env.NODE_ENV === 'development' && { resetUrl })
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return NextResponse.json(
            { error: 'An error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
