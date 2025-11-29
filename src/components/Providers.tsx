'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-center" richColors />
    </SessionProvider>
  );
}
