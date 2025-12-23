// Email templates (client-safe, no 'use server')

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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
    }) => ({
        subject: `New booking request for ${data.listingTitle}`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Booking Request</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.hostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${data.tenantName}</strong> has requested to book your listing <strong>"${data.listingTitle}"</strong>.
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; color: #71717a; font-size: 14px;">Requested dates:</p>
                <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 600;">
                    ${data.startDate} - ${data.endDate}
                </p>
            </div>
            <a href="${APP_URL}/bookings" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Booking Request
            </a>
        `),
    }),

    bookingAccepted: (data: {
        tenantName: string;
        listingTitle: string;
        hostName: string;
        startDate: string;
        listingId: string;
    }) => ({
        subject: `Your booking for ${data.listingTitle} has been accepted!`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Booking Confirmed!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.tenantName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Great news! <strong>${data.hostName}</strong> has accepted your booking request for <strong>"${data.listingTitle}"</strong>.
            </p>
            <div style="background-color: #dcfce7; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
                <p style="margin: 0; color: #166534; font-size: 16px; font-weight: 600;">
                    Your move-in date: ${data.startDate}
                </p>
            </div>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We recommend reaching out to your host to coordinate move-in details.
            </p>
            <a href="${APP_URL}/bookings" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Booking Details
            </a>
        `),
    }),

    bookingRejected: (data: {
        tenantName: string;
        listingTitle: string;
        hostName: string;
        rejectionReason?: string;
    }) => ({
        subject: `Update on your booking request for ${data.listingTitle}`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Booking Update</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.tenantName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Unfortunately, <strong>${data.hostName}</strong> was unable to accept your booking request for <strong>"${data.listingTitle}"</strong>.
            </p>
            ${data.rejectionReason ? `
            <div style="margin: 0 0 24px; padding: 16px; background-color: #f4f4f5; border-radius: 8px; border-left: 4px solid #71717a;">
                <p style="margin: 0 0 8px; color: #52525b; font-size: 14px; font-weight: 600;">
                    Reason from host:
                </p>
                <p style="margin: 0; color: #3f3f46; font-size: 15px; line-height: 1.5;">
                    "${data.rejectionReason}"
                </p>
            </div>
            ` : ''}
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Don't worry! There are plenty of other great listings available. Keep searching to find your perfect room.
            </p>
            <a href="${APP_URL}/search" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Browse More Listings
            </a>
        `),
    }),

    newMessage: (data: {
        recipientName: string;
        senderName: string;
        messagePreview: string;
        conversationId: string;
    }) => ({
        subject: `New message from ${data.senderName}`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Message</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.recipientName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                You have a new message from <strong>${data.senderName}</strong>:
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #18181b;">
                <p style="margin: 0; color: #18181b; font-size: 16px; font-style: italic;">
                    "${data.messagePreview.length > 150 ? data.messagePreview.substring(0, 150) + '...' : data.messagePreview}"
                </p>
            </div>
            <a href="${APP_URL}/messages/${data.conversationId}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reply to Message
            </a>
        `),
    }),

    newReview: (data: {
        hostName: string;
        reviewerName: string;
        listingTitle: string;
        rating: number;
        listingId: string;
    }) => ({
        subject: `New ${data.rating}-star review on ${data.listingTitle}`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Review Received</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.hostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${data.reviewerName}</strong> just left a review on your listing <strong>"${data.listingTitle}"</strong>.
            </p>
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px;">Rating</p>
                <p style="margin: 0; color: #18181b; font-size: 32px;">
                    ${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}
                </p>
            </div>
            <a href="${APP_URL}/listings/${data.listingId}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Review
            </a>
        `),
    }),

    listingSaved: (data: {
        hostName: string;
        saverName: string;
        listingTitle: string;
        listingId: string;
    }) => ({
        subject: `Someone saved your listing "${data.listingTitle}"`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Your Listing is Getting Attention!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.hostName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${data.saverName}</strong> just saved your listing <strong>"${data.listingTitle}"</strong> to their favorites.
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                This is a great sign of interest! Make sure your listing is up to date to attract potential tenants.
            </p>
            <a href="${APP_URL}/listings/${data.listingId}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Your Listing
            </a>
        `),
    }),

    searchAlert: (data: {
        userName: string;
        searchQuery: string;
        newListingsCount: number;
        searchId: string;
    }) => ({
        subject: `${data.newListingsCount} new listings match your search`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">New Listings Alert</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.userName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We found <strong>${data.newListingsCount} new listing${data.newListingsCount > 1 ? 's' : ''}</strong> matching your saved search: <strong>"${data.searchQuery}"</strong>
            </p>
            <a href="${APP_URL}/search?${data.searchQuery}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View New Listings
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                <a href="${APP_URL}/saved-searches" style="color: #71717a;">Manage your saved searches</a>
            </p>
        `),
    }),

    welcomeEmail: (data: { userName: string; verificationUrl?: string }) => ({
        subject: `Welcome to RoomShare, ${data.userName}!`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Welcome to RoomShare!</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.userName},
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
                <a href="${data.verificationUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
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
            <a href="${APP_URL}/profile/edit" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Complete Your Profile
            </a>
        `),
    }),

    emailVerification: (data: { userName: string; verificationUrl: string }) => ({
        subject: 'Verify your RoomShare email address',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Verify Your Email Address</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.userName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Please verify your email address to unlock all RoomShare features, including creating listings and sending messages.
            </p>
            <a href="${data.verificationUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Verify Email Address
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                This link will expire in 24 hours. If it expires, simply log in to your account and request a new verification email.
            </p>
            <p style="margin: 16px 0 0; color: #a1a1aa; font-size: 12px;">
                If the button above doesn't work, copy and paste this link into your browser:
            </p>
            <p style="margin: 8px 0 0; color: #71717a; font-size: 11px; word-break: break-all;">
                ${data.verificationUrl}
            </p>
            <p style="margin: 12px 0 0; color: #a1a1aa; font-size: 12px;">
                If you didn't create a RoomShare account, you can safely ignore this email.
            </p>
        `),
    }),

    passwordReset: (data: { userName: string; resetLink: string }) => ({
        subject: 'Reset your RoomShare password',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Password Reset Request</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.userName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password:
            </p>
            <a href="${data.resetLink}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Reset Password
            </a>
            <p style="margin: 24px 0 0; color: #71717a; font-size: 14px;">
                This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
        `),
    }),

    reviewResponse: (data: {
        reviewerName: string;
        hostName: string;
        listingTitle: string;
        responsePreview: string;
        listingId: string;
    }) => ({
        subject: `${data.hostName} responded to your review`,
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Response to Your Review</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.reviewerName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${data.hostName}</strong> has responded to your review on <strong>"${data.listingTitle}"</strong>:
            </p>
            <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #18181b;">
                <p style="margin: 0; color: #18181b; font-size: 16px; font-style: italic;">
                    "${data.responsePreview.length > 200 ? data.responsePreview.substring(0, 200) + '...' : data.responsePreview}"
                </p>
            </div>
            <a href="${APP_URL}/listings/${data.listingId}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Response
            </a>
        `),
    }),

    verificationRejected: (data: {
        userName: string;
        reason: string;
    }) => ({
        subject: 'Your Verification Request Update',
        html: baseTemplate(`
            <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Verification Request Update</h2>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hi ${data.userName},
            </p>
            <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your identity verification request was not approved.
            </p>
            <div style="background-color: #fef2f2; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #fecaca;">
                <p style="margin: 0 0 8px; color: #991b1b; font-size: 14px; font-weight: 600;">Reason:</p>
                <p style="margin: 0; color: #7f1d1d; font-size: 14px;">
                    ${data.reason}
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
            <a href="${APP_URL}/verify" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                View Verification Status
            </a>
        `),
    }),
};
