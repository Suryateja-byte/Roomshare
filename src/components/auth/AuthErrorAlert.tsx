import Link from 'next/link';
import { AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { getAuthErrorInfo } from '@/lib/auth-errors';

interface AuthErrorAlertProps {
    errorCode: string | null | undefined;
    customError?: string | null;
}

const severityStyles = {
    error: {
        container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        text: 'text-red-700 dark:text-red-400',
        icon: AlertCircle,
    },
    warning: {
        container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        text: 'text-amber-700 dark:text-amber-400',
        icon: AlertTriangle,
    },
    info: {
        container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        text: 'text-blue-700 dark:text-blue-400',
        icon: Info,
    },
};

export function AuthErrorAlert({ errorCode, customError }: AuthErrorAlertProps) {
    // Handle custom error (from form validation, etc.)
    if (customError && !errorCode) {
        const styles = severityStyles.error;
        const Icon = styles.icon;

        return (
            <div className={`${styles.container} border rounded-xl p-4`}>
                <div className="flex gap-3">
                    <Icon className={`h-5 w-5 flex-shrink-0 ${styles.text}`} />
                    <div className={`text-sm ${styles.text}`}>
                        <p className="font-medium">{customError}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Handle OAuth/auth error codes
    const errorInfo = getAuthErrorInfo(errorCode);
    if (!errorInfo) return null;

    const styles = severityStyles[errorInfo.severity];
    const Icon = styles.icon;

    return (
        <div className={`${styles.container} border rounded-xl p-4`}>
            <div className="flex gap-3">
                <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${styles.text}`} />
                <div className="flex-1 space-y-2">
                    <p className={`text-sm font-medium ${styles.text}`}>
                        {errorInfo.message}
                    </p>
                    {errorInfo.hint && (
                        <p className={`text-sm ${styles.text} opacity-90`}>
                            {errorInfo.hint}
                        </p>
                    )}
                    {errorInfo.showPasswordReset && (
                        <Link
                            href="/forgot-password"
                            className={`inline-flex items-center gap-1 text-sm font-medium ${styles.text} hover:underline`}
                        >
                            Reset your password
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AuthErrorAlert;
