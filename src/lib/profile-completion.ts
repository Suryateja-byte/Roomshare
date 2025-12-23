export interface ProfileCompletion {
    percentage: number;
    missing: string[];
    canCreateListing: boolean;
    canSendMessages: boolean;
    canBookRooms: boolean;
}

interface ProfileUser {
    name: string | null;
    email: string | null;
    emailVerified: Date | null;
    bio: string | null;
    image: string | null;
    countryOfOrigin: string | null;
    languages: string[];
    isVerified: boolean;
}

// Profile field weights (total = 100%)
const WEIGHTS = {
    name: 10,
    emailVerified: 20,
    bio: 15,
    image: 20,
    countryOfOrigin: 10,
    languages: 10,
    isVerified: 15, // ID verification
};

// Minimum requirements for actions
export const PROFILE_REQUIREMENTS = {
    createListing: 60,
    sendMessages: 40,
    bookRooms: 80,
};

export function calculateProfileCompletion(user: ProfileUser): ProfileCompletion {
    let percentage = 0;
    const missing: string[] = [];

    // Check each field
    if (user.name && user.name.trim().length >= 2) {
        percentage += WEIGHTS.name;
    } else {
        missing.push('Add your name');
    }

    if (user.emailVerified) {
        percentage += WEIGHTS.emailVerified;
    } else {
        missing.push('Verify your email');
    }

    if (user.bio && user.bio.trim().length >= 20) {
        percentage += WEIGHTS.bio;
    } else {
        missing.push('Write a bio (at least 20 characters)');
    }

    if (user.image) {
        percentage += WEIGHTS.image;
    } else {
        missing.push('Add a profile photo');
    }

    if (user.countryOfOrigin) {
        percentage += WEIGHTS.countryOfOrigin;
    } else {
        missing.push('Add your country of origin');
    }

    if (user.languages && user.languages.length > 0) {
        percentage += WEIGHTS.languages;
    } else {
        missing.push('Add languages you speak');
    }

    if (user.isVerified) {
        percentage += WEIGHTS.isVerified;
    } else {
        missing.push('Complete ID verification');
    }

    return {
        percentage,
        missing,
        canCreateListing: percentage >= PROFILE_REQUIREMENTS.createListing,
        canSendMessages: percentage >= PROFILE_REQUIREMENTS.sendMessages,
        canBookRooms: percentage >= PROFILE_REQUIREMENTS.bookRooms,
    };
}

export function getMissingForAction(
    user: ProfileUser,
    action: 'createListing' | 'sendMessages' | 'bookRooms'
): { allowed: boolean; missing: string[]; percentage: number; required: number } {
    const completion = calculateProfileCompletion(user);
    const required = PROFILE_REQUIREMENTS[action];

    return {
        allowed: completion.percentage >= required,
        missing: completion.missing,
        percentage: completion.percentage,
        required,
    };
}
