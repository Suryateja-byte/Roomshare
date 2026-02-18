// Email templates (client-safe, no 'use server')

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

function sanitizeSubject(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
}

function buildAppHref(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return escapeHtml(`${APP_URL}${normalizedPath}`);
}

// Base email template
export const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RoomShare</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #18181b; padding: 32px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">RoomShare</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 32px;">
                            ${content}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #fafafa; padding: 24px 32px; text-align: center; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 12px;">
                                This email was sent by RoomShare. If you have questions, contact us at support@roomshare.com
                            </p>
                            <p style="margin: 8px 0 0; color: #a1a1aa; font-size: 11px;">
                                &copy; ${new Date().getFullYear()} RoomShare. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

// Notification email templates
export const emailTemplates = {
    bookingRequest: (data: {
        hostName: string;
        tenantName: string;
        listingTitle: string;
        startDate: string;
        endDate: string;
        listingId: string;
    }) => {
        const safeHostName = escapeHtml(data.hostName);
        const safeTenantName = escapeHtml(data.tenantName);
        const safeListingTitle = escapeHtml(data.listingTitle);
        const safeStartDate = escapeHtml(data.startDate);
        const safeEndDate = escapeHtml(data.endDate);

        return {
        subject: sanitizeSubject(`New booking request for ${data.listingTitle}`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Booking Request</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeHostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${safeTenantName}</strong> has requested to book your listing <strong>"${safeListingTitle}"</strong>.
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #71717a; font-size: 14px;">Requested dates:</p>
                <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 600;">
                    ${safeStartDate} - ${safeEndDate}
                </p>
            </div>
            <a href="${buildAppHref('/bookings')}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Booking Request
            </a>
        `),
    };
    },

    bookingAccepted: (data: {
        tenantName: string;
        listingTitle: string;
        hostName: string;
        startDate: string;
        listingId: string;
    }) => {
        const safeTenantName = escapeHtml(data.tenantName);
        const safeListingTitle = escapeHtml(data.listingTitle);
        const safeHostName = escapeHtml(data.hostName);
        const safeStartDate = escapeHtml(data.startDate);

        return {
        subject: sanitizeSubject(`Your booking for ${data.listingTitle} has been accepted!`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Booking Confirmed!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeTenantName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Great news! <strong>${safeHostName}</strong> has accepted your booking request for <strong>"${safeListingTitle}"</strong>.
            </p>
            <div style="background-color: #dcfce7; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
                <p style="margin: 0; color: #166534; font-size: 16px; font-weight: 600;">
                    Your move-in date: ${safeStartDate}
                </p>
            </div>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We recommend reaching out to your host to coordinate move-in details.
            </p>
            <a href="${buildAppHref('/bookings')}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Booking Details
            </a>
        `),
    };
    },

    bookingRejected: (data: {
        tenantName: string;
        listingTitle: string;
        hostName: string;
        rejectionReason?: string;
    }) => {
        const safeTenantName = escapeHtml(data.tenantName);
        const safeListingTitle = escapeHtml(data.listingTitle);
        const safeHostName = escapeHtml(data.hostName);
        const safeRejectionReason = data.rejectionReason ? escapeHtml(data.rejectionReason) : '';

        return {
        subject: sanitizeSubject(`Update on your booking request for ${data.listingTitle}`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Booking Update</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeTenantName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Unfortunately, <strong>${safeHostName}</strong> was unable to accept your booking request for <strong>"${safeListingTitle}"</strong>.
            </p>
            ${data.rejectionReason ? `
            <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px; border-left: 4px solid #71717a;">
                <p style="margin: 0 0 8px; color: #52525b; font-size: 14px; font-weight: 600;">
                    Reason from host:
                </p>
                <p style="margin: 0; color: #3f3f46; font-size: 15px; line-height: 1.5;">
                    "${safeRejectionReason}"
                </p>
            </div>
            ` : ''}
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Don't worry! There are plenty of other great listings available. Keep searching to find your perfect room.
            </p>
            <a href="${buildAppHref('/search')}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Browse More Listings
            </a>
        `),
    };
    },

    newMessage: (data: {
        recipientName: string;
        senderName: string;
        messagePreview: string;
        conversationId: string;
    }) => {
        const safeRecipientName = escapeHtml(data.recipientName);
        const safeSenderName = escapeHtml(data.senderName);
        const messagePreview = data.messagePreview.length > 150
            ? `${data.messagePreview.substring(0, 150)}...`
            : data.messagePreview;
        const safeMessagePreview = escapeHtml(messagePreview);
        const conversationHref = buildAppHref(`/messages/${encodeURIComponent(data.conversationId)}`);

        return {
        subject: sanitizeSubject(`New message from ${data.senderName}`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Message</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeRecipientName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                You have a new message from <strong>${safeSenderName}</strong>:
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #18181b;">
                <p style="margin: 0; color: #18181b; font-size: 16px; font-style: italic;">
                    "${safeMessagePreview}"
                </p>
            </div>
            <a href="${conversationHref}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reply to Message
            </a>
        `),
    };
    },

    newReview: (data: {
        hostName: string;
        reviewerName: string;
        listingTitle: string;
        rating: number;
        listingId: string;
    }) => {
        const safeHostName = escapeHtml(data.hostName);
        const safeReviewerName = escapeHtml(data.reviewerName);
        const safeListingTitle = escapeHtml(data.listingTitle);
        const safeRating = Number.isFinite(data.rating)
            ? Math.max(0, Math.min(5, Math.floor(data.rating)))
            : 0;

        return {
        subject: sanitizeSubject(`New ${data.rating}-star review on ${data.listingTitle}`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Review Received</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeHostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${safeReviewerName}</strong> just left a review on your listing <strong>"${safeListingTitle}"</strong>.
            </p>
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px;">Rating</p>
                <p style="margin: 0; color: #18181b; font-size: 32px;">
                    ${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}
                </p>
            </div>
            <a href="${buildAppHref(`/listings/${encodeURIComponent(data.listingId)}`)}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Review
            </a>
        `),
    };
    },

    listingSaved: (data: {
        hostName: string;
        saverName: string;
        listingTitle: string;
        listingId: string;
    }) => {
        const safeHostName = escapeHtml(data.hostName);
        const safeSaverName = escapeHtml(data.saverName);
        const safeListingTitle = escapeHtml(data.listingTitle);

        return {
        subject: sanitizeSubject(`Someone saved your listing "${data.listingTitle}"`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Your Listing is Getting Attention!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeHostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${safeSaverName}</strong> just saved your listing <strong>"${safeListingTitle}"</strong> to their favorites.
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                This is a great sign of interest! Make sure your listing is up to date to attract potential tenants.
            </p>
            <a href="${buildAppHref(`/listings/${encodeURIComponent(data.listingId)}`)}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Your Listing
            </a>
        `),
    };
    },

    searchAlert: (data: {
        userName: string;
        searchQuery: string;
        newListingsCount: number;
        searchId: string;
    }) => {
        const safeUserName = escapeHtml(data.userName);
        const safeSearchQuery = escapeHtml(data.searchQuery);
        const searchHref = buildAppHref(`/search?q=${encodeURIComponent(data.searchQuery)}`);

        return {
            subject: sanitizeSubject(`${data.newListingsCount} new listings match your search`),
            html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Listings Alert</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeUserName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We found <strong>${data.newListingsCount} new listing${data.newListingsCount > 1 ? 's' : ''}</strong> matching your saved search: <strong>"${safeSearchQuery}"</strong>
            </p>
            <a href="${searchHref}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View New Listings
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                <a href="${buildAppHref('/saved-searches')}" style="color: #71717a;">Manage your saved searches</a>
            </p>
        `),
        };
    },

    welcomeEmail: (data: { userName: string; verificationUrl?: string }) => {
        const safeUserName = escapeHtml(data.userName);
        const safeVerificationUrl = data.verificationUrl ? escapeHtml(data.verificationUrl) : '';

        return {
        subject: sanitizeSubject(`Welcome to RoomShare, ${data.userName}!`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Welcome to RoomShare!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeUserName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We're thrilled to have you join our community of roommates and hosts. RoomShare makes it easy to find the perfect shared living space.
            </p>
            ${data.verificationUrl ? `
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #fcd34d;">
                <p style="margin: 0 0 12px; color: #92400e; font-size: 14px; font-weight: 600;">Please verify your email address</p>
                <p style="margin: 0 0 16px; color: #78350f; font-size: 14px;">
                    Click the button below to verify your email and unlock all features.
                </p>
                <a href="${safeVerificationUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Verify Email Address
                </a>
            </div>
            ` : ''}
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 16px; color: #18181b; font-size: 16px;">Get Started:</h3>
                <ul style="margin: 0; padding: 0 0 0 20px; color: #52525b; font-size: 14px; line-height: 1.8;">
                    <li>Complete your profile to build trust</li>
                    <li>Browse listings in your area</li>
                    <li>Save your favorite places</li>
                    <li>Message hosts to learn more</li>
                </ul>
            </div>
            <a href="${buildAppHref('/profile/edit')}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Complete Your Profile
            </a>
        `),
    };
    },

    emailVerification: (data: { userName: string; verificationUrl: string }) => {
        const safeUserName = escapeHtml(data.userName);
        const safeVerificationUrl = escapeHtml(data.verificationUrl);

        return {
        subject: 'Verify your RoomShare email address',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Verify Your Email Address</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeUserName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Please verify your email address to unlock all RoomShare features, including creating listings and sending messages.
            </p>
            <a href="${safeVerificationUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Verify Email Address
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                This link will expire in 24 hours. If it expires, simply log in to your account and request a new verification email.
            </p>
            <p style="margin: 16px 0 0; color: #a1a1aa; font-size: 12px;">
                If the button above doesn't work, copy and paste this link into your browser:
            </p>
            <p style="margin: 8px 0 0; color: #71717a; font-size: 11px; word-break: break-all;">
                ${safeVerificationUrl}
            </p>
            <p style="margin: 12px 0 0; color: #a1a1aa; font-size: 12px;">
                If you didn't create a RoomShare account, you can safely ignore this email.
            </p>
        `),
    };
    },

    passwordReset: (data: { userName: string; resetLink: string }) => {
        const safeUserName = escapeHtml(data.userName);
        const safeResetLink = escapeHtml(data.resetLink);

        return {
        subject: 'Reset your RoomShare password',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Password Reset Request</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeUserName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password:
            </p>
            <a href="${safeResetLink}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reset Password
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
        `),
    };
    },

    reviewResponse: (data: {
        reviewerName: string;
        hostName: string;
        listingTitle: string;
        responsePreview: string;
        listingId: string;
    }) => {
        const safeReviewerName = escapeHtml(data.reviewerName);
        const safeHostName = escapeHtml(data.hostName);
        const safeListingTitle = escapeHtml(data.listingTitle);
        const responsePreview = data.responsePreview.length > 200
            ? `${data.responsePreview.substring(0, 200)}...`
            : data.responsePreview;
        const safeResponsePreview = escapeHtml(responsePreview);

        return {
        subject: sanitizeSubject(`${data.hostName} responded to your review`),
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Response to Your Review</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeReviewerName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${safeHostName}</strong> has responded to your review on <strong>"${safeListingTitle}"</strong>:
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #18181b;">
                <p style="margin: 0; color: #18181b; font-size: 16px; font-style: italic;">
                    "${safeResponsePreview}"
                </p>
            </div>
            <a href="${buildAppHref(`/listings/${encodeURIComponent(data.listingId)}`)}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Response
            </a>
        `),
    };
    },

    verificationRejected: (data: {
        userName: string;
        reason: string;
    }) => {
        const safeUserName = escapeHtml(data.userName);
        const safeReason = escapeHtml(data.reason);

        return {
        subject: 'Your Verification Request Update',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Verification Request Update</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${safeUserName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your identity verification request was not approved.
            </p>
            <div style="background-color: #fef2f2; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #fecaca;">
                <p style="margin: 0 0 8px; color: #991b1b; font-size: 14px; font-weight: 600;">Reason:</p>
                <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
                    ${safeReason}
                </p>
            </div>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; color: #18181b; font-size: 14px; font-weight: 600;">Tips for a successful verification:</p>
                <ul style="margin: 0; padding: 0 0 0 20px; color: #52525b; font-size: 14px; line-height: 1.8;">
                    <li>Ensure your document is clearly visible with all corners showing</li>
                    <li>Take photos in good lighting without glare or shadows</li>
                    <li>Make sure the text on your ID is readable</li>
                    <li>Use the original document, not a photocopy</li>
                </ul>
            </div>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                You can submit a new verification request after 24 hours.
            </p>
            <a href="${buildAppHref('/verify')}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Verification Status
            </a>
        `),
    };
    },
};
