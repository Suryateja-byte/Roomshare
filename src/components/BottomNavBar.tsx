"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { triggerLightHaptic } from "@/lib/haptics";
import Link from "next/link";
import { Search, Heart, PlusCircle, MessageSquare, User } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  matchPaths: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/search",
    label: "Explore",
    icon: Search,
    matchPaths: ["/search"],
  },
  {
    href: "/saved",
    label: "Saved",
    icon: Heart,
    matchPaths: ["/saved"],
  },
  {
    href: "/listings/create",
    label: "List",
    icon: PlusCircle,
    matchPaths: ["/listings/create"],
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageSquare,
    matchPaths: ["/messages"],
  },
  {
    href: "/profile",
    label: "Profile",
    icon: User,
    matchPaths: ["/profile", "/settings"],
  },
];

export default function BottomNavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    const scrollContainer = document.querySelector("[data-scroll-container]");
    if (!scrollContainer) return;

    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentY = scrollContainer.scrollTop;
        const delta = currentY - lastScrollY.current;

        // Only toggle after meaningful scroll (>10px)
        if (Math.abs(delta) > 10) {
          setVisible(delta < 0 || currentY < 50);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Don't render on search page — it has its own bottom sheet and floating buttons
  const isSearchPage = pathname.startsWith("/search");
  if (!session?.user || isSearchPage) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className={`
        fixed bottom-0 left-0 right-0 z-sticky md:hidden
        bg-surface-container-lowest
        shadow-[0_-2px_16px_rgb(27_28_25/0.06)]
        border-t border-outline-variant/30
        transition-transform duration-300
        ${visible ? "translate-y-0" : "translate-y-full"}
      `}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = item.matchPaths.some((p) =>
            pathname.startsWith(p)
          );
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => triggerLightHaptic()}
              className={`
                flex flex-col items-center justify-center
                min-w-[44px] min-h-[44px] px-2 py-1
                transition-colors duration-200
                ${isActive ? "text-primary" : "text-on-surface-variant"}
              `}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                size={22}
                className={isActive ? "stroke-[2.5]" : "stroke-[1.5]"}
              />
              <span className="text-xs uppercase tracking-widest font-body font-medium mt-0.5">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
