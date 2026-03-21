import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verification Expired | RoomShare",
  description: "Your verification link has expired. Request a new one to continue.",
  robots: { index: false, follow: true },
};

export default function VerifyExpiredLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
