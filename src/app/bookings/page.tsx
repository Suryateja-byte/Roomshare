import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Messages | RoomShare",
  description: "Booking has been retired. Continue conversations in messages.",
};

export default async function BookingsRedirectPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/messages");
  }

  redirect("/messages");
}
