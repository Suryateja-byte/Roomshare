"use client";

/**
 * SearchHeaderWrapper - Manages collapsible header on mobile and desktop
 *
 * On mobile:
 * - Shows full SearchForm when at top or manually expanded
 * - Shows collapsed bar when scrolled down
 * - Collapsed bar shows location summary and filter access
 *
 * On desktop:
 * - Shows full SearchForm when at top or manually expanded
 * - Shows compact search pill when scrolled down
 */

import { Suspense, lazy, useCallback, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Menu, User, Plus, Heart, Settings, LogOut } from "lucide-react";
import { useScrollHeader } from "@/hooks/useScrollHeader";
import {
  useKeyboardShortcuts,
} from "@/hooks/useKeyboardShortcuts";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import CollapsedMobileSearch from "@/components/CollapsedMobileSearch";
import { CompactSearchPill } from "@/components/search/CompactSearchPill";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import NotificationCenter from "@/components/NotificationCenter";
import ThemeToggle from "@/components/ThemeToggle";

// LCP optimization: Lazy-load SearchForm to defer its ~875-line bundle + heavy dependencies
// This allows listing images (the LCP elements) to render before SearchForm JavaScript loads
const SearchForm = lazy(() => import("@/components/SearchForm"));

const MenuItem = ({
    icon,
    text,
    danger,
    onClick,
    href
}: {
    icon: React.ReactNode;
    text: string;
    danger?: boolean;
    onClick?: () => void;
    href?: string;
}) => {
    const className = `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 ${danger
        ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
        }`;

    const content = (
        <>
            <span className={danger ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}>{icon}</span>
            {text}
        </>
    );

    if (href) {
        return (
            <Link href={href} className={className} onClick={onClick}>
                {content}
            </Link>
        );
    }
    return (
        <button onClick={onClick} className={className}>
            {content}
        </button>
    );
};

export default function SearchHeaderWrapper() {
  const { isCollapsed } = useScrollHeader({ threshold: 80 });
  const { isExpanded, expand, openFilters } = useMobileSearch();
  const { data: session } = useSession();
  const user = session?.user;
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
              setIsProfileOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      action: () => document.getElementById("search-location")?.focus(),
      description: "Focus search input",
    },
  ]);

  // Show collapsed bar when scrolled and not manually expanded
  const showCollapsed = isCollapsed && !isExpanded;

  const handleExpandDesktop = useCallback(() => {
    // Scroll to top to reveal the full form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      {/* Full search form - hidden when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "hidden" : "block"
        }`}
      >
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 cursor-pointer group flex-shrink-0 mr-2 md:mr-6" aria-label="RoomShare Home">
                <div className="w-9 h-9 bg-zinc-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-zinc-900 font-bold text-xl transition-all duration-500 group-hover:rotate-[10deg] group-hover:scale-110 shadow-lg shadow-zinc-900/10 dark:shadow-white/5">
                    R
                </div>
                <span className="text-xl font-semibold tracking-[-0.03em] text-zinc-900 dark:text-white hidden lg:block">
                    RoomShare<span className="text-indigo-600 dark:text-indigo-400">.</span>
                </span>
            </Link>

            {/* Search Form */}
            <div className="flex-1 min-w-0 relative">
              <Suspense
                fallback={
                  /*
                   * CLS fix: Fallback dimensions must match actual SearchForm height
                   * Mobile: p-1.5 (12px) + button h-11 (44px) = 56px ≈ h-14
                   * Desktop: md:p-2 (16px) + button sm:h-12 (48px) = 64px ≈ sm:h-16
                   * Use rounded-xl to match actual form, not rounded-full
                   */
                  <div className="h-14 sm:h-16 w-full bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-xl border border-zinc-200/80 dark:border-zinc-700/80" />
                }
              >
                <SearchForm />
              </Suspense>
            </div>

            {/* Right Actions - User Profile / Auth */}
            <div className="hidden lg:flex items-center gap-3 sm:gap-5 flex-shrink-0 ml-2">
                <div className="flex items-center gap-1 pr-2 border-r border-zinc-200/50 dark:border-white/10">
                    <NotificationCenter />
                    <Link
                        href="/messages"
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2"
                        aria-label="Messages"
                    >
                        <MessageSquare size={18} strokeWidth={2} />
                    </Link>
                </div>

                {user ? (
                    <div className="relative" ref={profileRef}>
                        <button
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            className={`group flex items-center gap-2 p-1 pl-1.5 pr-1 min-h-[40px] rounded-full border transition-all duration-300 ${isProfileOpen
                                ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white'
                                : 'border-zinc-200/50 dark:border-white/10 hover:border-zinc-400 dark:hover:border-zinc-500'
                                }`}
                            aria-expanded={isProfileOpen}
                            aria-haspopup="true"
                            aria-label="User menu"
                        >
                            <UserAvatar image={user.image} name={user.name} size="sm" />
                            <Menu
                                size={16}
                                className={`transition-colors duration-300 ${isProfileOpen ? 'text-white dark:text-zinc-900' : 'text-zinc-500 dark:text-zinc-400'}`}
                            />
                        </button>

                        <div
                            className={`absolute right-0 mt-4 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-[1.5rem] shadow-2xl shadow-zinc-900/10 dark:shadow-black/60 border border-zinc-200/50 dark:border-white/5 overflow-hidden origin-top-right z-[1200] transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) ${isProfileOpen
                                    ? 'opacity-100 translate-y-0 visible scale-100'
                                    : 'opacity-0 -translate-y-4 invisible scale-95 pointer-events-none'
                                }`}
                        >
                            <div className="p-6 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]">
                                <p className="font-semibold text-zinc-900 dark:text-white tracking-tight">{user.name}</p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</p>
                            </div>
                            <div className="p-2.5 space-y-0.5">
                                <MenuItem icon={<User size={16} />} text="Profile" href="/profile" onClick={() => setIsProfileOpen(false)} />
                                <MenuItem icon={<Plus size={16} />} text="List a Room" href="/listings/create" onClick={() => setIsProfileOpen(false)} />
                                <MenuItem icon={<Heart size={16} />} text="Saved" href="/saved" onClick={() => setIsProfileOpen(false)} />
                                <div className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"></div>
                                <MenuItem icon={<Settings size={16} />} text="Settings" href="/settings" onClick={() => setIsProfileOpen(false)} />
                                <ThemeToggle variant="menu-item" />
                                <div className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"></div>
                                <MenuItem
                                    icon={<LogOut size={16} />}
                                    text="Log out"
                                    danger
                                    onClick={() => {
                                        signOut({ callbackUrl: '/' });
                                        setIsProfileOpen(false);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <Link
                            href="/login"
                            className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-4 py-2 transition-all duration-300 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5"
                        >
                            Log in
                        </Link>
                        <Link href="/signup">
                            <Button size="sm" className="rounded-full px-6 h-10 shadow-lg shadow-zinc-900/10">
                                Join
                            </Button>
                        </Link>
                    </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsed search bar - visible on mobile only when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "md:hidden block py-2" : "hidden"
        }`}
      >
        <CollapsedMobileSearch onExpand={expand} onOpenFilters={openFilters} />
      </div>

      {/* Compact search pill - visible on desktop only when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "hidden md:block py-2 px-6" : "hidden"
        }`}
      >
        <CompactSearchPill
          onExpand={handleExpandDesktop}
          onOpenFilters={openFilters}
        />
      </div>
    </>
  );
}
