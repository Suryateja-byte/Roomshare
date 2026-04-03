import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Newsreader, Manrope } from "next/font/google";
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
import BottomNavBar from "@/components/BottomNavBar";
import { WebVitals } from "@/components/WebVitals";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal"],
  display: "swap",
  variable: "--font-display",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app"
  ),
  title: "RoomShare — Find Your People, Not Just a Place",
  description: "Verified roommates. Real listings. People who actually show up to the tour.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RoomShare",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf9f4",
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
    <html lang="en">
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
      <body className={`${newsreader.variable} ${manrope.variable} font-body bg-surface-canvas text-on-surface`}>
        <Providers nonce={nonce}>
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
          <BottomNavBar />
          <OfflineIndicator />
          <ServiceWorkerRegistration />
          <WebVitals />
        </Providers>
      </body>
    </html>
  );
}
