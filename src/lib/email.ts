'use server';

// Email notification service - Server Actions only
// Uses Resend API for sending emails

import { emailTemplates } from './email-templates';
import { prisma } from '@/lib/prisma';
import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout';

// Timeout for email API requests (15 seconds - emails can be slow)
const EMAIL_TIMEOUT_MS = 15000;

// P1-23 FIX: Email retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1s, 2s, 4s with exponential backoff

// Helper to determine if an error is retryable
function isRetryableError(error: unknown, response?: Response): boolean {
    // Timeout errors are retryable
    if (error instanceof FetchTimeoutError) return true;

    // Network errors are retryable
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
        return true;
    }

    // 5xx server errors are retryable, 4xx client errors are not
    if (response && response.status >= 500) return true;

    return false;
}

// Helper for exponential backoff delay
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Email sending function with retry logic
export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<{ success: boolean; error?: string }> {
    if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not configured. Email not sent:', { to, subject });
        // In development, just log the email
        console.log('Email would be sent:', { to, subject, html: html.substring(0, 200) });
        return { success: true }; // Return success in dev mode
    }

    let lastError: string | undefined;

    // P1-23 FIX: Implement retry with exponential backoff
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetchWithTimeout('https://api.resend.com/emails', {
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
                timeout: EMAIL_TIMEOUT_MS,
            });

            if (!response.ok) {
                const errorText = await response.text();

                // Don't retry 4xx client errors (validation failures, etc.)
                if (response.status >= 400 && response.status < 500) {
                    console.error('Failed to send email (non-retryable):', errorText);
                    return { success: false, error: errorText };
                }

                // 5xx errors are retryable
                if (isRetryableError(null, response) && attempt < MAX_RETRIES - 1) {
                    const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Email send failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
                    await sleep(delay);
                    lastError = errorText;
                    continue;
                }

                console.error('Failed to send email:', errorText);
                return { success: false, error: errorText };
            }

            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof FetchTimeoutError
                ? `Email request timed out after ${EMAIL_TIMEOUT_MS}ms`
                : String(error);

            // Check if error is retryable
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
                console.warn(`Email send error (attempt ${attempt + 1}/${MAX_RETRIES}): ${errorMessage}, retrying in ${delay}ms...`);
                await sleep(delay);
                lastError = errorMessage;
                continue;
            }

            console.error('Error sending email:', error);
            return { success: false, error: errorMessage };
        }
    }

    // This should only be reached if all retries failed
    return { success: false, error: lastError || 'Failed after multiple retries' };
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

            // P0 FIX: Safely cast preferences with defensive defaults
            // Handle case where notificationPreferences is null, undefined, or malformed JSON
            const rawPrefs = user?.notificationPreferences;
            const prefs: Partial<NotificationPreferences> =
                (typeof rawPrefs === 'object' && rawPrefs !== null)
                    ? (rawPrefs as Partial<NotificationPreferences>)
                    : {};

            // If preference is explicitly set to false, skip sending
            // Default behavior (undefined/missing key) = enabled (send email)
            if (prefs[prefKey] === false) {
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
