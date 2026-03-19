import type { Metadata } from "next";
import SignUpClient from "./SignUpClient";

export const metadata: Metadata = {
  title: "Sign Up | RoomShare",
};

export default function SignUpPage() {
  return <SignUpClient />;
}
