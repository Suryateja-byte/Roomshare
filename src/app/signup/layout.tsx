import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | RoomShare",
  description:
    "Join RoomShare to find compatible roommates, browse shared housing, and connect with verified renters in your area.",
  openGraph: {
    title: "Create Your RoomShare Account",
    description:
      "Join RoomShare to find compatible roommates, browse shared housing, and connect with verified renters.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Your RoomShare Account",
    description:
      "Join RoomShare to find compatible roommates, browse shared housing, and connect with verified renters.",
  },
  alternates: {
    canonical: "/signup",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
