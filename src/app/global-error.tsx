"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Critical Error</h2>
          <p>{error.message || 'A critical error has occurred.'}</p>
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
      </body>
    </html>
  );
}
