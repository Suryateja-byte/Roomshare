import type { Metadata } from "next";
import ForgotPasswordClient from "./ForgotPasswordClient";

export const metadata: Metadata = {
  title: "Reset Password | RoomShare",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
