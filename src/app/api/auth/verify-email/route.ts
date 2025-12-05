import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.redirect(new URL('/?error=missing_token', request.url));
        }

        // Find the verification token
        const verificationToken = await prisma.verificationToken.findUnique({
            where: { token }
        });

        if (!verificationToken) {
            return NextResponse.redirect(new URL('/?error=invalid_token', request.url));
        }

        // Check if token is expired
        if (verificationToken.expires < new Date()) {
            // Delete expired token
            await prisma.verificationToken.delete({
                where: { token }
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

        // Update user's emailVerified timestamp
        await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() }
        });

        // Delete the used token
        await prisma.verificationToken.delete({
            where: { token }
        });

        // Redirect to home with success message
        return NextResponse.redirect(new URL('/?verified=true', request.url));
    } catch (error) {
        console.error('Email verification error:', error);
        return NextResponse.redirect(new URL('/?error=verification_failed', request.url));
    }
}
