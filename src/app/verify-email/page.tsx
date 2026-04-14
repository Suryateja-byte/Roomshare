import type { Metadata } from "next";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify Your Email | RoomShare",
  description: "Confirm your RoomShare email address to unlock account access.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
