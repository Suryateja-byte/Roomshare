import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin-auth";

export const metadata = {
  title: "Admin | RoomShare",
  description: "Booking evidence has been retired with the contact-first cutover.",
};

export default async function AdminBookingsRedirectPage() {
  const adminCheck = await requireAdminAuth();
  if (adminCheck.code === "SESSION_EXPIRED") {
    redirect("/login?callbackUrl=/admin");
  }
  if (!adminCheck.isAdmin) {
    redirect("/");
  }

  redirect("/admin");
}
