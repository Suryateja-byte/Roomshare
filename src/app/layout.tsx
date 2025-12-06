import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import NavbarWrapper from "@/components/NavbarWrapper";
import Footer from "@/components/Footer";
import FooterWrapper from "@/components/FooterWrapper";
import Providers from "@/components/Providers";
import { SkipLink } from "@/components/ui/SkipLink";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import EmailVerificationWrapper from "@/components/EmailVerificationWrapper";
import CustomScrollContainer from "@/components/ui/CustomScrollContainer";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={inter.className}>
        <Providers>
          <SkipLink />
          <CustomScrollContainer>
            <div className="flex flex-col min-h-screen">
              <NavbarWrapper>
                <Navbar />
              </NavbarWrapper>
              <EmailVerificationWrapper />
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
        </Providers>
      </body>
    </html>
  );
}
