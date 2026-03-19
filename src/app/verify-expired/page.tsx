import type { Metadata } from "next";
import VerifyExpiredClient from "./VerifyExpiredClient";

export const metadata: Metadata = {
  title: "Verification Expired | RoomShare",
};

export default function VerifyExpiredPage() {
  return <VerifyExpiredClient />;
}
