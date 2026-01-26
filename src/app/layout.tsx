import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
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
        {/* Mapbox - maps, tiles, and geocoding API */}
        <link rel="preconnect" href="https://api.mapbox.com" />
        <link rel="preconnect" href="https://events.mapbox.com" />
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
