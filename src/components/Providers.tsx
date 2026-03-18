"use client";

import { SessionProvider } from "next-auth/react";
import { Session } from "next-auth";
import { Toaster } from "sonner";
import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";

interface ProvidersProps {
  children: ReactNode;
  session?: Session | null;
  nonce?: string;
}

export default function Providers({
  children,
  session,
  nonce,
}: ProvidersProps) {
  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider
        session={session}
        refetchOnWindowFocus={true}
        refetchInterval={600} // Refresh session every 10 minutes
      >
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </SessionProvider>
    </MotionConfig>
  );
}
