'use server';

// Email notification service - Server Actions only
// Uses Resend API for sending emails

import { emailTemplates } from './email-templates';
import { prisma } from '@/lib/prisma';

// Notification preference keys that map to email types
interface NotificationPreferences {
    emailBookingRequests?: boolean;
    emailBookingUpdates?: boolean;
    emailMessages?: boolean;
    emailReviews?: boolean;
    emailSearchAlerts?: boolean;
    emailMarketing?: boolean;
}

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
                // Disable click tracking to prevent Resend from wrapping links
                // This fixes issues with resend-clicks.com connection errors
                headers: {
                    'X-Entity-Ref-ID': new Date().getTime().toString(),
                },
                // Disable tracking features that wrap links
                tags: [{ name: 'category', value: 'transactional' }],
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
        // @ts-expect-error - TypeScript has trouble with the dynamic template selection
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

// Map email types to user preference keys
const emailTypeToPreferenceKey: Record<string, keyof NotificationPreferences> = {
    bookingRequest: 'emailBookingRequests',
    bookingAccepted: 'emailBookingUpdates',
    bookingRejected: 'emailBookingUpdates',
    bookingCancelled: 'emailBookingUpdates',
    newMessage: 'emailMessages',
    newReview: 'emailReviews',
    searchAlert: 'emailSearchAlerts',
    marketing: 'emailMarketing',
};

/**
 * Send notification email while respecting user's notification preferences
 * This wrapper checks if the user has disabled this type of email notification
 * @param type - The email template type
 * @param userId - The user's ID to check preferences
 * @param email - The user's email address
 * @param data - The template data
 * @returns { success: boolean; skipped?: boolean; error?: string }
 */
export async function sendNotificationEmailWithPreference(
    type: keyof typeof emailTemplates,
    userId: string,
    email: string,
    data: Parameters<typeof emailTemplates[typeof type]>[0]
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    try {
        // Check if this email type has a preference mapping
        const prefKey = emailTypeToPreferenceKey[type];

        if (prefKey) {
            // Fetch user's notification preferences
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { notificationPreferences: true }
            });

            const prefs = user?.notificationPreferences as NotificationPreferences | null;

            // If preference is explicitly set to false, skip sending
            if (prefs && prefs[prefKey] === false) {
                console.log(`[EMAIL] Skipped ${type} email to ${userId} - user preference disabled`);
                return { success: true, skipped: true };
            }
        }

        // Send the email
        return await sendNotificationEmail(type, email, data);
    } catch (error) {
        console.error(`Error in sendNotificationEmailWithPreference for ${type}:`, error);
        return { success: false, error: String(error) };
    }
}
