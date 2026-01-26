import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withRateLimit } from '@/lib/with-rate-limit';

const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    // P0-02 FIX: Enforce same 12-char minimum as register endpoint
    password: z.string().min(12, 'Password must be at least 12 characters')
});

export async function POST(request: NextRequest) {
    // P1-2 FIX: Add rate limiting to prevent token brute-forcing
    const rateLimitResponse = await withRateLimit(request, { type: 'resetPassword' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const body = await request.json();

        // Validate input
        const result = resetPasswordSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.issues[0].message },
                { status: 400 }
            );
        }

        const { token, password } = result.data;

        // Find the reset token
        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token }
        });

        if (!resetToken) {
            return NextResponse.json(
                { error: 'Invalid or expired reset link' },
                { status: 400 }
            );
        }

        // Check if token has expired
        if (resetToken.expires < new Date()) {
            // Delete expired token
            await prisma.passwordResetToken.delete({
                where: { id: resetToken.id }
            });

            return NextResponse.json(
                { error: 'Reset link has expired. Please request a new one.' },
                { status: 400 }
            );
        }

        // Find the user
        const user = await prisma.user.findUnique({
            where: { email: resetToken.email }
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user's password
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        // Delete the used token
        await prisma.passwordResetToken.delete({
            where: { id: resetToken.id }
        });

        return NextResponse.json({
            message: 'Password has been reset successfully'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json(
            { error: 'An error occurred. Please try again.' },
            { status: 500 }
        );
    }
}

// GET endpoint to verify token validity
export async function GET(request: NextRequest) {
    // P1-2 FIX: Add rate limiting to prevent token enumeration
    const rateLimitResponse = await withRateLimit(request, { type: 'resetPassword' });
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json(
            { valid: false, error: 'Token is required' },
            { status: 400 }
        );
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token }
    });

    if (!resetToken) {
        return NextResponse.json(
            { valid: false, error: 'Invalid reset link' },
            { status: 400 }
        );
    }

    if (resetToken.expires < new Date()) {
        return NextResponse.json(
            { valid: false, error: 'Reset link has expired' },
            { status: 400 }
        );
    }

    return NextResponse.json({ valid: true });
}
