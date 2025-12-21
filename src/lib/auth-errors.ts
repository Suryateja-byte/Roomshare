/**
 * OAuth and authentication error message mapping
 * Maps NextAuth error codes to user-friendly messages with enhanced metadata
 */

export interface AuthErrorInfo {
    message: string;
    hint?: string;
    showPasswordReset?: boolean;
    showEmailForm?: boolean;
    severity: 'error' | 'warning' | 'info';
}

export const AUTH_ERROR_INFO: Record<string, AuthErrorInfo> = {
    // OAuth-specific errors
    EmailNotVerified: {
        message: 'Your Google account email is not verified.',
        hint: 'Please verify your email in Google settings first, then try again.',
        severity: 'warning',
    },
    AccessDenied: {
        message: 'Sign-in was cancelled.',
        hint: 'You may have cancelled the sign-in process or denied permissions.',
        severity: 'info',
    },
    OAuthSignin: {
        message: 'Could not start the sign-in process.',
        hint: 'Please try again. If the problem persists, try using email and password instead.',
        showEmailForm: true,
        severity: 'error',
    },
    OAuthCallback: {
        message: 'Could not complete sign-in.',
        hint: 'Please try again. If the problem persists, try using email and password instead.',
        showEmailForm: true,
        severity: 'error',
    },
    OAuthCreateAccount: {
        message: 'Could not create your account.',
        hint: 'Please try again or sign up with email and password instead.',
        severity: 'error',
    },
    OAuthAccountNotLinked: {
        message: 'This email is already registered with a password.',
        hint: 'Please sign in using the email form below. If you forgot your password, use the reset link.',
        showPasswordReset: true,
        showEmailForm: true,
        severity: 'warning',
    },

    // Configuration errors
    Configuration: {
        message: 'There is a problem with the server configuration.',
        hint: 'Please try again later or contact support if the issue persists.',
        severity: 'error',
    },

    // Session errors
    SessionRequired: {
        message: 'Please sign in to access this page.',
        severity: 'info',
    },

    // Account status errors
    AccountSuspended: {
        message: 'Your account has been suspended.',
        hint: 'Please contact support for assistance.',
        severity: 'error',
    },

    // Credential errors
    CredentialsSignin: {
        message: 'Invalid email or password.',
        hint: 'Please check your credentials and try again.',
        showPasswordReset: true,
        severity: 'error',
    },

    // Generic fallback
    Default: {
        message: 'An error occurred during sign-in.',
        hint: 'Please try again.',
        severity: 'error',
    },
};

// Backward-compatible simple string mapping
export const AUTH_ERROR_MESSAGES: Record<string, string> = Object.fromEntries(
    Object.entries(AUTH_ERROR_INFO).map(([key, info]) => [key, info.message])
);

/**
 * Get a user-friendly error message for an auth error code
 */
export function getAuthErrorMessage(errorCode: string | null | undefined): string | null {
    if (!errorCode) return null;
    return AUTH_ERROR_MESSAGES[errorCode] || AUTH_ERROR_MESSAGES.Default;
}

/**
 * Get enhanced error info for an auth error code
 */
export function getAuthErrorInfo(errorCode: string | null | undefined): AuthErrorInfo | null {
    if (!errorCode) return null;
    return AUTH_ERROR_INFO[errorCode] || AUTH_ERROR_INFO.Default;
}

/**
 * Check if an error code indicates a retriable error
 */
export function isRetriableError(errorCode: string | null | undefined): boolean {
    if (!errorCode) return false;
    const retriableErrors = ['OAuthSignin', 'OAuthCallback', 'Configuration', 'Default'];
    return retriableErrors.includes(errorCode);
}

/**
 * Check if the error suggests showing password reset link
 */
export function shouldShowPasswordReset(errorCode: string | null | undefined): boolean {
    if (!errorCode) return false;
    return AUTH_ERROR_INFO[errorCode]?.showPasswordReset ?? false;
}

/**
 * Check if the error suggests highlighting the email form
 */
export function shouldHighlightEmailForm(errorCode: string | null | undefined): boolean {
    if (!errorCode) return false;
    return AUTH_ERROR_INFO[errorCode]?.showEmailForm ?? false;
}
