'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';

interface RateLimitCountdownProps {
    retryAfterSeconds: number;
    onRetryReady: () => void;
    message?: string;
}

export function RateLimitCountdown({
    retryAfterSeconds,
    onRetryReady,
    message = 'Too many requests'
}: RateLimitCountdownProps) {
    const [secondsLeft, setSecondsLeft] = useState(retryAfterSeconds);

    const handleComplete = useCallback(() => {
        onRetryReady();
    }, [onRetryReady]);

    useEffect(() => {
        if (secondsLeft <= 0) {
            handleComplete();
            return;
        }

        const timer = setTimeout(() => {
            setSecondsLeft(s => s - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [secondsLeft, handleComplete]);

    // Reset countdown if retryAfterSeconds changes
    useEffect(() => {
        setSecondsLeft(retryAfterSeconds);
    }, [retryAfterSeconds]);

    if (secondsLeft <= 0) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
                {message}. Try again in{' '}
                <span className="font-semibold tabular-nums">
                    {secondsLeft}
                </span>
                {' '}second{secondsLeft !== 1 ? 's' : ''}
            </span>
        </div>
    );
}

export default RateLimitCountdown;
