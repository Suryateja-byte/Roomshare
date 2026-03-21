import type { Metadata } from "next";
import AboutClient from "./AboutClient";

export const metadata: Metadata = {
  title: "About RoomShare — How It Works",
};

export default function AboutPage() {
  return <AboutClient />;
}
