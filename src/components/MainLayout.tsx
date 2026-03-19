"use client";

import { usePathname } from "next/navigation";

function pathShouldRemovePadding(pathname: string): boolean {
  if (!pathname) return false;

  const isHomePage = pathname === "/";
  const isSearchPage =
    pathname === "/search" || pathname.startsWith("/search/");
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify";

  return isHomePage || isSearchPage || isAuthPage;
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const noPadding = pathShouldRemovePadding(pathname);

  return (
    <main
      id="main-content"
      className={`flex-grow${noPadding ? "" : " pt-16 md:pt-20"}`}
    >
      {children}
    </main>
  );
}
