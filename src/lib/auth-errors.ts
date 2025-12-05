/**
 * OAuth and authentication error message mapping
 * Maps NextAuth error codes to user-friendly messages
 */

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
    // OAuth-specific errors
    EmailNotVerified: 'Your Google account email is not verified. Please verify it first.',
    AccessDenied: 'Access was denied. You may have cancelled the sign-in process.',
    OAuthSignin: 'Could not start the sign-in process. Please try again.',
    OAuthCallback: 'Could not complete sign-in. Please try again.',
    OAuthCreateAccount: 'Could not create your account. Please try again.',
    OAuthAccountNotLinked: 'This email is already registered. Try signing in with your original method.',

    // Configuration errors
    Configuration: 'There is a problem with the server configuration. Please try again later.',

    // Session errors
    SessionRequired: 'Please sign in to access this page.',

    // Credential errors
    CredentialsSignin: 'Invalid email or password.',

    // Generic fallback
    Default: 'An error occurred during sign-in. Please try again.'
};

/**
 * Get a user-friendly error message for an auth error code
 */
export function getAuthErrorMessage(errorCode: string | null | undefined): string | null {
    if (!errorCode) return null;
    return AUTH_ERROR_MESSAGES[errorCode] || AUTH_ERROR_MESSAGES.Default;
}

/**
 * Check if an error code indicates a retriable error
 */
export function isRetriableError(errorCode: string | null | undefined): boolean {
    if (!errorCode) return false;
    const retriableErrors = ['OAuthSignin', 'OAuthCallback', 'Configuration', 'Default'];
    return retriableErrors.includes(errorCode);
}
