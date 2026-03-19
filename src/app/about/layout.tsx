import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | RoomShare",
  description:
    "Learn about RoomShare's mission to make finding compatible roommates and shared housing safe, simple, and transparent.",
  openGraph: {
    title: "About RoomShare",
    description:
      "Our mission is to make finding compatible roommates and shared housing safe, simple, and transparent.",
  },
  twitter: {
    card: "summary_large_image",
    title: "About RoomShare",
    description:
      "Our mission is to make finding compatible roommates and shared housing safe, simple, and transparent.",
  },
  alternates: {
    canonical: "/about",
  },
};

// Organization schema JSON-LD — static string literal, no user-input, XSS-safe
const organizationJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "RoomShare",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://roomshare.app",
  description:
    "RoomShare connects compatible roommates with shared housing through verified profiles and instant messaging.",
  sameAs: [],
});

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: organizationJsonLd }}
      />
      {children}
    </>
  );
}
