"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

interface RoomShareThemeProviderProps extends ThemeProviderProps {
  nonce?: string;
}

export function ThemeProvider({
  children,
  nonce,
  ...props
}: RoomShareThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
