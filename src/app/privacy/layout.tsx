import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | RoomShare",
  description:
    "Read RoomShare's privacy policy. Learn how we collect, use, and protect your personal information when using our platform.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
