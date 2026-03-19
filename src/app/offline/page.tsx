import type { Metadata } from "next";
import OfflineClient from "./OfflineClient";

export const metadata: Metadata = {
  title: "Offline | RoomShare",
};

export default function OfflinePage() {
  return <OfflineClient />;
}
