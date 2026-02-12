'use client';

import { forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export interface TurnstileWidgetRef {
    reset(): void;
    getToken(): string | undefined;
}

interface TurnstileWidgetProps {
    onToken: (token: string) => void;
    onExpire?: () => void;
    onError?: (code: string) => void;
    className?: string;
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
    function TurnstileWidget({ onToken, onExpire, onError, className }, ref) {
        const instanceRef = useRef<TurnstileInstance | null>(null);

        useImperativeHandle(ref, () => ({
            reset() {
                instanceRef.current?.reset();
            },
            getToken() {
                return instanceRef.current?.getResponse() ?? undefined;
            },
        }));

        const handleSuccess = useCallback(
            (token: string) => onToken(token),
            [onToken],
        );

        const handleExpire = useCallback(() => {
            onExpire?.();
        }, [onExpire]);

        const handleError = useCallback(
            (code: string) => {
                onError?.(code);
            },
            [onError],
        );

        // Graceful degradation: no site key → render nothing
        if (!siteKey) return null;

        return (
            <div data-testid="turnstile-widget" className={className}>
                <Turnstile
                    ref={instanceRef}
                    siteKey={siteKey}
                    onSuccess={handleSuccess}
                    onExpire={handleExpire}
                    onError={handleError}
                    options={{
                        theme: 'auto',
                        responseField: true,
                        responseFieldName: 'cf-turnstile-response',
                    }}
                />
            </div>
        );
    },
);

export default TurnstileWidget;
