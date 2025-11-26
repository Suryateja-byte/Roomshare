'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
            <div className="space-y-6 max-w-md">
                <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="h-12 w-12 text-red-500" />
                </div>

                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Something went wrong!
                </h2>

                <p className="text-muted-foreground">
                    We encountered an unexpected error. Please try again later.
                </p>

                <div className="pt-4">
                    <Button
                        onClick={() => reset()}
                        size="lg"
                        className="rounded-full px-8"
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Try Again
                    </Button>
                </div>
            </div>
        </div>
    );
}
