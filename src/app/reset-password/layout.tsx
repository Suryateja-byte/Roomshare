import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | RoomShare",
  description:
    "Create a new password for your RoomShare account.",
  robots: { index: false, follow: true },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
