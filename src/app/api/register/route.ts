import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendNotificationEmail } from '@/lib/email';
import { withRateLimit } from '@/lib/with-rate-limit';
import crypto from 'crypto';

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(12, 'Password must be at least 12 characters'),
});

export async function POST(request: Request) {
    // Rate limit: 5 registrations per hour per IP
    const rateLimitResponse = await withRateLimit(request, { type: 'register' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const body = await request.json();
        const result = registerSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const { name, email, password } = result.data;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user (emailVerified is null by default for soft verification)
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                emailVerified: null, // Not verified yet
            },
        });

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token: verificationToken,
                expires,
            },
        });

        // Build verification URL
        const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

        // Send welcome email with verification link (non-blocking)
        sendNotificationEmail('welcomeEmail', email, {
            userName: name,
            verificationUrl
        }).catch(err => console.error('Failed to send welcome email:', err));

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        return NextResponse.json(userWithoutPassword, { status: 201 });

    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
