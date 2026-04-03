"use client";

import { usePathname } from "next/navigation";

export default function NavbarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify";

  // Search routes have their own header with search functionality
  const isSearchPage =
    pathname === "/search" || pathname.startsWith("/search/");
  const isMessageThread = pathname.startsWith("/messages/");

  if (isAuthPage || isSearchPage || isMessageThread) {
    return null;
  }

  return <>{children}</>;
}
