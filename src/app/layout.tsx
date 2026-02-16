import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import NavbarWrapper from "@/components/NavbarWrapper";
import Footer from "@/components/Footer";
import FooterWrapper from "@/components/FooterWrapper";
import Providers from "@/components/Providers";
import { SkipLink } from "@/components/ui/SkipLink";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import EmailVerificationWrapper from "@/components/EmailVerificationWrapper";
import SuspensionBannerWrapper from "@/components/SuspensionBannerWrapper";
import CustomScrollContainer from "@/components/ui/CustomScrollContainer";
import { WebVitals } from "@/components/WebVitals";

const inter = localFont({
  src: "../fonts/InterVariable.woff2",
  display: "swap",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app"
  ),
  title: "RoomShare - Find Your Perfect Roommate",
  description: "Connect with compatible roommates and find your ideal home.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RoomShare",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import MainLayout from "@/components/MainLayout";

// ... existing imports

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch session server-side to initialize SessionProvider with session
  // This prevents hydration mismatch where client briefly sees no session
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external origins for faster resource loading */}
        {/* OpenFreeMap - map tiles and glyphs */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" />
        {/* Supabase - storage for listing images */}
        <link rel="preconnect" href="https://qolpgfdmkqvxraafucvu.supabase.co" />
        {/* Unsplash - fallback images */}
        <link rel="preconnect" href="https://images.unsplash.com" />
      </head>
      <body className={inter.className}>
        <Providers session={session}>
          <SkipLink />
          <CustomScrollContainer>
            <div className="flex flex-col min-h-screen">
              <NavbarWrapper>
                <Navbar />
              </NavbarWrapper>
              <EmailVerificationWrapper />
              <SuspensionBannerWrapper />
              <MainLayout>
                {children}
              </MainLayout>
              <FooterWrapper>
                <Footer />
              </FooterWrapper>
            </div>
          </CustomScrollContainer>
          <OfflineIndicator />
          <ServiceWorkerRegistration />
          <WebVitals />
        </Providers>
      </body>
    </html>
  );
}
