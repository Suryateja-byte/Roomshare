import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Log In | RoomShare",
};

export default function LoginPage() {
  return <LoginClient />;
}
