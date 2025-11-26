'use server';

// Email notification service - Server Actions only
// Uses Resend API for sending emails

import { emailTemplates } from './email-templates';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Use Resend's testing domain by default (can only send to your own email in test mode)
const FROM_EMAIL = process.env.FROM_EMAIL || 'RoomShare <onboarding@resend.dev>';

// Email sending function
export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<{ success: boolean; error?: string }> {
    if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not configured. Email not sent:', { to, subject });
        // In development, just log the email
        console.log('Email would be sent:', { to, subject, html: html.substring(0, 200) });
        return { success: true }; // Return success in dev mode
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to,
                subject,
                html,
                text: text || html.replace(/<[^>]*>/g, ''),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to send email:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: String(error) };
    }
}

// Helper to send notification email based on type
export async function sendNotificationEmail(
    type: keyof typeof emailTemplates,
    email: string,
    data: Parameters<typeof emailTemplates[typeof type]>[0]
): Promise<{ success: boolean; error?: string }> {
    try {
        // @ts-ignore - TypeScript has trouble with the dynamic template selection
        const template = emailTemplates[type](data);
        return await sendEmail({
            to: email,
            subject: template.subject,
            html: template.html,
        });
    } catch (error) {
        console.error(`Error sending ${type} email:`, error);
        return { success: false, error: String(error) };
    }
}
