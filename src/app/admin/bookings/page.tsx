import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin | RoomShare",
  description: "Booking evidence has been retired with the contact-first cutover.",
};

export default async function AdminBookingsRedirectPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }

  if (!session.user.isAdmin) {
    redirect("/");
  }

  redirect("/admin");
}
