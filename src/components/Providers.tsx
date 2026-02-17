'use client';

import { SessionProvider } from 'next-auth/react';
import { Session } from 'next-auth';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';

interface ProvidersProps {
  children: ReactNode;
  session?: Session | null;
}

export default function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus={true}
      refetchInterval={300} // Refresh session every 5 minutes
    >
      <ThemeProvider>
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </SessionProvider>
  );
}
