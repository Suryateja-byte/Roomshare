import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | RoomShare",
  description:
    "Reset your RoomShare password. Enter your email to receive a password reset link.",
  robots: { index: false, follow: true },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
