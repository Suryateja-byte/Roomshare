import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import NavbarWrapper from "@/components/NavbarWrapper";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import { SkipLink } from "@/components/ui/SkipLink";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  display: "swap",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={nunito.className}>
        <Providers>
          <SkipLink />
          <div className="flex flex-col min-h-screen">
            <NavbarWrapper>
              <Navbar />
            </NavbarWrapper>
            <main id="main-content" className="flex-grow pt-16 md:pt-20" role="main">
              {children}
            </main>
            <Footer />
          </div>
          <OfflineIndicator />
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  );
}
