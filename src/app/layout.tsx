import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import MainLayout from "@/components/MainLayout";
// CSP nonce is forwarded via x-nonce header from src/proxy.ts
// Read it here with: const nonce = (await headers()).get('x-nonce') || undefined;
// when adding inline <Script nonce={nonce}> tags

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external origins for faster resource loading */}
        {/* OpenFreeMap - map tiles and glyphs */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" />
        {/* Supabase - storage for listing images */}
        <link
          rel="preconnect"
          href="https://qolpgfdmkqvxraafucvu.supabase.co"
        />
        {/* Unsplash - fallback images */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        {/* JSON-LD: WebSite schema with SearchAction for sitelinks search box.
            Content is static server-side JSON — no user input, safe from XSS. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "RoomShare",
              url:
                process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app",
              description:
                "Find compatible roommates and shared housing. Verified profiles, instant messaging, and flexible leases.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app"}/search?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers nonce={nonce}>
          <SkipLink />
          <CustomScrollContainer>
            <div className="flex flex-col min-h-screen">
              <NavbarWrapper>
                <Navbar />
              </NavbarWrapper>
              <EmailVerificationWrapper />
              <SuspensionBannerWrapper />
              <MainLayout>{children}</MainLayout>
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
