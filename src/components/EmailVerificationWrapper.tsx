'use client';

import { useSession } from 'next-auth/react';
import EmailVerificationBanner from './EmailVerificationBanner';

export default function EmailVerificationWrapper() {
    const { data: session, status } = useSession();

    // Don't show if loading or not logged in
    if (status === 'loading' || !session?.user) {
        return null;
    }

    // Don't show if email is already verified
    // The session user should include emailVerified from the auth callback
    if (session.user.emailVerified) {
        return null;
    }

    return <EmailVerificationBanner userEmail={session.user.email} />;
}
