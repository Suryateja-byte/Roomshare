import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { sendNotificationEmail } from '@/lib/email';
import { withRateLimit } from '@/lib/with-rate-limit';
import { normalizeEmail } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
    // Rate limit: 3 password reset requests per hour per IP
    const rateLimitResponse = await withRateLimit(request, { type: 'forgotPassword' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { email } = await request.json();

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

        // Generate a secure random token
        const token = crypto.randomBytes(32).toString('hex');

        // Token expires in 1 hour
        const expires = new Date(Date.now() + 60 * 60 * 1000);

        // Save the token
        await prisma.passwordResetToken.create({
            data: {
                email: normalizedEmail,
                token,
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
        await sendNotificationEmail('passwordReset', normalizedEmail, {
            userName: user.name || 'User',
            resetLink: resetUrl
        });

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
