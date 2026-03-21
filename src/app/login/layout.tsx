import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | RoomShare",
  description:
    "Sign in to your RoomShare account to manage listings, message roommates, and track bookings.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
