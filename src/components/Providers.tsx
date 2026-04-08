"use client";

import { SessionProvider } from "next-auth/react";
import { Session } from "next-auth";
import { Toaster } from "sonner";
import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";

interface ProvidersProps {
  children: ReactNode;
  session?: Session | null;
  nonce?: string;
}

export default function Providers({ children, session }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <SessionProvider
          session={session}
          refetchOnWindowFocus={false}
          refetchInterval={600000}
        >
          {children}
          <Toaster position="top-center" richColors />
        </SessionProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
