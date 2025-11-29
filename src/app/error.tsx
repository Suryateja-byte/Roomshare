'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h2>Something went wrong!</h2>
            <p>{error.message || 'An unexpected error occurred.'}</p>
            <button
                onClick={() => reset()}
                style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: 'black',
                    color: 'white',
                    borderRadius: '0.5rem'
                }}
            >
                Try again
            </button>
        </div>
    );
}
