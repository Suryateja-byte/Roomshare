'use client';

import { useSession } from 'next-auth/react';
import SuspensionBanner from './SuspensionBanner';

/**
 * Wrapper component that conditionally renders the SuspensionBanner
 * based on the user's session state.
 * P0-01 / P1-01: Shows suspension notification to affected users.
 */
export default function SuspensionBannerWrapper() {
    const { data: session, status } = useSession();

    // Don't show if loading or not logged in
    if (status === 'loading' || !session?.user) {
        return null;
    }

    // Only show if user is suspended
    if (!session.user.isSuspended) {
        return null;
    }

    return <SuspensionBanner />;
}
