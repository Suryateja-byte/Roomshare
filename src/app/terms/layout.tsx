import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | RoomShare",
  description:
    "Review RoomShare's terms of service. Understand your rights and responsibilities when using our roommate and housing platform.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
