"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { signOut, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Plus,
  MessageSquare,
  Menu,
  X,
  Search,
  User,
  LogOut,
  Settings,
  Calendar,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import NotificationCenter from "@/components/NotificationCenter";
import ThemeToggle from "@/components/ThemeToggle";

// --- Helper Components ---

const IconButton = ({
  icon,
  count,
  onClick,
  href,
  ariaLabel,
}: {
  icon: React.ReactNode;
  count?: number;
  onClick?: () => void;
  href?: string;
  ariaLabel?: string;
}) => {
  const buttonContent = (
    <>
      {icon}
      {count !== undefined && count > 0 && (
        <span
          data-testid="unread-badge"
          className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5"
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white dark:border-zinc-900"></span>
        </span>
      )}
    </>
  );

  const className =
    "p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2";

  if (href) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {buttonContent}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className} aria-label={ariaLabel}>
      {buttonContent}
    </button>
  );
};

const MenuItem = ({
  icon,
  text,
  badge,
  danger,
  onClick,
  href,
  role: ariaRole = "menuitem",
  tabIndex = -1,
  onMouseEnter,
}: {
  icon: React.ReactNode;
  text: string;
  badge?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
  role?: string;
  tabIndex?: number;
  onMouseEnter?: () => void;
}) => {
  const className = `w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
    danger
      ? "text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
  }`;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span
          className={
            danger ? "text-red-500" : "text-zinc-400 dark:text-zinc-500"
          }
        >
          {icon}
        </span>
        {text}
      </div>
      {badge && (
        <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-xs font-bold">
          {badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        onClick={onClick}
        role={ariaRole}
        tabIndex={tabIndex}
        onMouseEnter={onMouseEnter}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className={className}
      role={ariaRole}
      tabIndex={tabIndex}
      onMouseEnter={onMouseEnter}
    >
      {content}
    </button>
  );
};

// --- Main Navbar Component ---

interface NavbarClientProps {
  user: Session["user"] | null;
  unreadCount?: number;
}

// Exponential backoff constants for polling
const BASE_POLL_INTERVAL = 30000; // 30 seconds
const MAX_BACKOFF_INTERVAL = 300000; // 5 minutes max
const BACKOFF_MULTIPLIER = 2;

export default function NavbarClient({
  user: initialUser,
  unreadCount = 0,
}: NavbarClientProps) {
  const { data: session, status } = useSession();

  // Use reactive session data, fall back to server props for SSR hydration
  const user =
    status === "loading"
      ? initialUser
      : status === "unauthenticated"
        ? null
        : (session?.user ?? initialUser);

  const pathname = usePathname();
  const menuButtonId = useId();
  const menuId = useId();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUnreadCount, setCurrentUnreadCount] = useState(unreadCount);
  const [activeMenuIndex, setActiveMenuIndex] = useState(-1);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<HTMLElement[]>([]);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  // Refs for exponential backoff polling
  const failureCountRef = useRef(0);
  const currentIntervalRef = useRef(BASE_POLL_INTERVAL);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // Schedule next poll with dynamic interval
  const scheduleNextPoll = useCallback(
    (interval: number, fetchFn: () => Promise<void>) => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      intervalIdRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchFn();
        }
      }, interval);
    },
    []
  );

  // Fetch unread count from API with exponential backoff
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/messages?view=unreadCount", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUnreadCount(data.count);

        // Reset backoff on successful response
        if (failureCountRef.current > 0) {
          failureCountRef.current = 0;
          currentIntervalRef.current = BASE_POLL_INTERVAL;
          scheduleNextPoll(BASE_POLL_INTERVAL, fetchUnreadCount);
        }
      }
    } catch {
      // Network error - implement exponential backoff
      failureCountRef.current += 1;
      const newInterval = Math.min(
        BASE_POLL_INTERVAL *
          Math.pow(BACKOFF_MULTIPLIER, failureCountRef.current),
        MAX_BACKOFF_INTERVAL
      );

      if (newInterval !== currentIntervalRef.current) {
        currentIntervalRef.current = newInterval;
        scheduleNextPoll(newInterval, fetchUnreadCount);
      }

      // Only log in development to reduce console noise (first 3 failures only)
      if (
        process.env.NODE_ENV === "development" &&
        failureCountRef.current <= 3
      ) {
        console.debug(
          `Unread count fetch failed (attempt ${failureCountRef.current}), next check in ${newInterval / 1000}s`
        );
      }
    }
  }, [user, scheduleNextPoll]);

  // Handle scroll effect for glassmorphism
  // The actual scroll container is CustomScrollContainer (.custom-scroll-hide),
  // not window (html/body have overflow:hidden).
  useEffect(() => {
    const scrollContainer =
      document.querySelector(".custom-scroll-hide") ?? window;
    const handleScroll = () => {
      const scrollTop =
        scrollContainer instanceof HTMLElement
          ? scrollContainer.scrollTop
          : window.scrollY;
      setIsScrolled(scrollTop > 20);
    };
    scrollContainer.addEventListener("scroll", handleScroll);
    handleScroll(); // Check initial scroll position
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle scroll locking and focus trapping for mobile menu
  // Body already has overflow:hidden (globals.css). Target the actual scroll container.
  useEffect(() => {
    if (isMobileMenuOpen) {
      const scrollContainer = document.querySelector(
        ".custom-scroll-hide"
      ) as HTMLElement | null;
      if (scrollContainer) {
        scrollContainer.style.overflow = "hidden";
      }

      // Prevent focus from escaping mobile menu into background content
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        mainContent.setAttribute("inert", "");
      }

      return () => {
        if (scrollContainer) {
          scrollContainer.style.overflow = "";
        }
        if (mainContent) {
          mainContent.removeAttribute("inert");
        }
      };
    }
  }, [isMobileMenuOpen]);

  // Close menus on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
        } else if (isProfileOpen) {
          setIsProfileOpen(false);
          triggerButtonRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, isProfileOpen]);

  // Poll for unread count updates and listen for custom events
  useEffect(() => {
    if (!user) return;

    // Reset backoff state
    failureCountRef.current = 0;
    currentIntervalRef.current = BASE_POLL_INTERVAL;

    // Fetch immediately on mount
    fetchUnreadCount();

    // Start polling with base interval
    scheduleNextPoll(BASE_POLL_INTERVAL, fetchUnreadCount);

    // Listen for custom event from messages page
    const handleMessagesRead = () => {
      fetchUnreadCount();
    };
    window.addEventListener("messagesRead", handleMessagesRead);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      window.removeEventListener("messagesRead", handleMessagesRead);
    };
  }, [user, fetchUnreadCount, scheduleNextPoll]);

  // Collect menu items when dropdown opens
  useEffect(() => {
    if (isProfileOpen) {
      // Use requestAnimationFrame to ensure DOM is painted after CSS transition starts
      requestAnimationFrame(() => {
        const menuEl = document.getElementById(menuId);
        if (menuEl) {
          const items = menuEl.querySelectorAll<HTMLElement>(
            '[role="menuitem"], [role="menuitemradio"]'
          );
          menuItemsRef.current = Array.from(items);
        }
      });
    } else {
      menuItemsRef.current = [];
      setActiveMenuIndex(-1);
    }
  }, [isProfileOpen, menuId]);

  // Keyboard handler for the menu container (roving tabindex)
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = menuItemsRef.current;
      const count = items.length;
      if (count === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = activeMenuIndex < count - 1 ? activeMenuIndex + 1 : 0;
          setActiveMenuIndex(next);
          items[next]?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = activeMenuIndex > 0 ? activeMenuIndex - 1 : count - 1;
          setActiveMenuIndex(prev);
          items[prev]?.focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          setActiveMenuIndex(0);
          items[0]?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          setActiveMenuIndex(count - 1);
          items[count - 1]?.focus();
          break;
        }
        case "Escape": {
          e.preventDefault();
          setIsProfileOpen(false);
          triggerButtonRef.current?.focus();
          break;
        }
        case "Tab": {
          // Close menu on Tab, let focus move naturally
          setIsProfileOpen(false);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          items[activeMenuIndex]?.click();
          break;
        }
        default: {
          // Character search: move to next item starting with typed character
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const char = e.key.toLowerCase();
            const startIndex = activeMenuIndex + 1;
            for (let i = 0; i < count; i++) {
              const idx = (startIndex + i) % count;
              const text = items[idx]?.textContent?.trim().toLowerCase();
              if (text?.startsWith(char)) {
                setActiveMenuIndex(idx);
                items[idx]?.focus();
                break;
              }
            }
          }
        }
      }
    },
    [activeMenuIndex]
  );

  // Keyboard handler for the trigger button (opening the menu)
  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        if (!isProfileOpen) {
          e.preventDefault();
          setIsProfileOpen(true);
          // Focus first item after menu renders — query DOM directly to avoid race with useEffect ref
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const items = document
                .getElementById(menuId)
                ?.querySelectorAll<HTMLElement>(
                  '[role="menuitem"], [role="menuitemradio"]'
                );
              if (items && items.length > 0) {
                setActiveMenuIndex(0);
                items[0]?.focus();
              }
            });
          });
        }
      }
      if (e.key === "ArrowUp") {
        if (!isProfileOpen) {
          e.preventDefault();
          setIsProfileOpen(true);
          // Focus last item after menu renders — query DOM directly
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const items = document
                .getElementById(menuId)
                ?.querySelectorAll<HTMLElement>(
                  '[role="menuitem"], [role="menuitemradio"]'
                );
              if (items && items.length > 0) {
                const lastIdx = items.length - 1;
                setActiveMenuIndex(lastIdx);
                items[lastIdx]?.focus();
              }
            });
          });
        }
      }
    },
    [isProfileOpen, menuId]
  );

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-dropdown transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] data-[anim-hidden=true]:-translate-y-full data-[anim-hidden=true]:opacity-0 data-[anim-hidden=true]:pointer-events-none data-[anim-hidden=true]:border-transparent ${
        isScrolled
          ? "py-4 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-sm border-b border-zinc-200/50 dark:border-zinc-800/50"
          : "py-6 bg-transparent"
      }`}
    >
    <nav aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="flex justify-between items-center h-10">
          {/* --- LEFT: Logo --- */}
          <Link
            href="/"
            className="flex items-center gap-2.5 cursor-pointer group flex-shrink-0"
          >
            <div className="w-9 h-9 bg-zinc-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-zinc-900 font-bold text-xl transition-all duration-500 group-hover:rotate-[10deg] group-hover:scale-110 shadow-lg shadow-zinc-900/10 dark:shadow-white/5">
              R
            </div>
            <span className="text-xl font-semibold tracking-[-0.03em] text-zinc-900 dark:text-white hidden sm:block">
              RoomShare
              <span className="text-indigo-600 dark:text-indigo-400">.</span>
            </span>
          </Link>

          {/* --- CENTER: Navigation Links --- */}
          <div className="hidden lg:flex flex-1 items-center justify-center gap-1">
            <Link
              href="/search"
              className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
                pathname === "/search"
                  ? "text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5"
              }`}
              aria-current={pathname === "/search" ? "page" : undefined}
            >
              Find a Room
            </Link>
            <Link
              href="/about"
              className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
                pathname === "/about"
                  ? "text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5"
              }`}
              aria-current={pathname === "/about" ? "page" : undefined}
            >
              How it works
            </Link>
          </div>

          {/* --- RIGHT: Actions --- */}
          <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
            <div className="hidden md:flex items-center gap-1 pr-2">
              <NotificationCenter />
              <IconButton
                icon={<MessageSquare size={18} strokeWidth={2} />}
                count={currentUnreadCount}
                href="/messages"
                ariaLabel={
                  currentUnreadCount > 0
                    ? `Messages, ${currentUnreadCount} unread`
                    : "Messages"
                }
              />
            </div>

            {/* Profile Dropdown / Auth Buttons */}
            {user ? (
              <div className="relative" ref={profileRef}>
                <button
                  ref={triggerButtonRef}
                  id={menuButtonId}
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  onKeyDown={handleTriggerKeyDown}
                  className={`group flex items-center gap-2 p-1 pl-1.5 pr-1 min-h-[40px] rounded-full transition-all duration-300 ${
                    isProfileOpen
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                  aria-expanded={isProfileOpen}
                  aria-haspopup="menu"
                  aria-controls={isProfileOpen ? menuId : undefined}
                  data-testid="user-menu"
                  aria-label="User menu"
                >
                  <UserAvatar image={user.image} name={user.name} size="sm" />
                  <Menu
                    size={16}
                    className={`transition-colors duration-300 ${isProfileOpen ? "text-white dark:text-zinc-900" : "text-zinc-500 dark:text-zinc-400"}`}
                  />
                </button>

                {/* Dropdown Menu - CSS animated, WAI-ARIA Menu Button pattern */}
                <div
                  id={menuId}
                  role="menu"
                  aria-labelledby={menuButtonId}
                  onKeyDown={handleMenuKeyDown}
                  className={`absolute right-0 mt-4 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-[1.5rem] shadow-2xl shadow-zinc-900/10 dark:shadow-black/60 border border-zinc-200/50 dark:border-white/5 overflow-hidden origin-top-right z-sticky transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isProfileOpen
                      ? "opacity-100 translate-y-0 visible scale-100"
                      : "opacity-0 -translate-y-4 invisible scale-95 pointer-events-none"
                  }`}
                >
                  <div
                    role="none"
                    className="p-6 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]"
                  >
                    <p className="font-semibold text-zinc-900 dark:text-white tracking-tight">
                      {user.name}
                    </p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {user.email}
                    </p>
                  </div>
                  <div role="none" className="p-2.5 space-y-0.5">
                    <MenuItem
                      icon={<User size={16} />}
                      text="Profile"
                      href="/profile"
                      onClick={() => setIsProfileOpen(false)}
                      tabIndex={activeMenuIndex === 0 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(0)}
                    />
                    <MenuItem
                      icon={<Plus size={16} />}
                      text="List a Room"
                      href="/listings/create"
                      onClick={() => setIsProfileOpen(false)}
                      tabIndex={activeMenuIndex === 1 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(1)}
                    />
                    <MenuItem
                      icon={<Heart size={16} />}
                      text="Saved"
                      href="/saved"
                      onClick={() => setIsProfileOpen(false)}
                      tabIndex={activeMenuIndex === 2 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(2)}
                    />
                    <div
                      role="separator"
                      className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"
                    ></div>
                    <MenuItem
                      icon={<Settings size={16} />}
                      text="Settings"
                      href="/settings"
                      onClick={() => setIsProfileOpen(false)}
                      tabIndex={activeMenuIndex === 3 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(3)}
                    />
                    <ThemeToggle
                      variant="menu-item"
                      onMenuItemMouseEnter={(offset) =>
                        setActiveMenuIndex(4 + offset)
                      }
                    />
                    <div
                      role="separator"
                      className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"
                    ></div>
                    <MenuItem
                      icon={<LogOut size={16} />}
                      text="Log out"
                      danger
                      onClick={() => {
                        signOut({ callbackUrl: "/" });
                        setIsProfileOpen(false);
                      }}
                      tabIndex={activeMenuIndex === 7 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(7)}
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
                <Button
                  asChild
                  size="sm"
                  className="rounded-full px-6 h-10 shadow-lg shadow-zinc-900/10"
                >
                  <Link href="/signup">Join</Link>
                </Button>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <div className="lg:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-zinc-900 dark:text-white p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu - CSS animated with grid for height:auto animation */}
      <div
        className={`lg:hidden bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-white/5 overflow-hidden grid transition-all duration-300 ease-out ${
          isMobileMenuOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
        role="dialog"
        aria-modal={isMobileMenuOpen}
        aria-label="Navigation menu"
        aria-hidden={!isMobileMenuOpen}
        inert={!isMobileMenuOpen || undefined}
      >
        <div className="overflow-hidden">
          <div className="px-6 py-4 space-y-4">
            {user ? (
              <div className="flex items-center gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <UserAvatar image={user.image} name={user.name} size="md" />
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">
                    {user.name}
                  </p>
                  <Link
                    href="/profile"
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            ) : null}

            <Link
              href="/search"
              className="flex items-center gap-3 py-3 text-base font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-2"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-current={pathname === "/search" ? "page" : undefined}
            >
              <Search size={20} className="text-zinc-400 dark:text-zinc-500" />{" "}
              Find a Room
            </Link>

            {user && (
              <>
                <Link
                  href="/messages"
                  className="flex items-center gap-3 py-3 text-base font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={pathname === "/messages" ? "page" : undefined}
                >
                  <MessageSquare
                    size={20}
                    className="text-zinc-400 dark:text-zinc-500"
                  />
                  Messages
                  {currentUnreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {currentUnreadCount > 9 ? "9+" : currentUnreadCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/bookings"
                  className="flex items-center gap-3 py-3 text-base font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={pathname === "/bookings" ? "page" : undefined}
                >
                  <Calendar
                    size={20}
                    className="text-zinc-400 dark:text-zinc-500"
                  />{" "}
                  Bookings
                </Link>
                <Link
                  href="/saved"
                  className="flex items-center gap-3 py-3 text-base font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={pathname === "/saved" ? "page" : undefined}
                >
                  <Heart
                    size={20}
                    className="text-zinc-400 dark:text-zinc-500"
                  />{" "}
                  Saved Listings
                </Link>
              </>
            )}

            <hr className="border-zinc-100 dark:border-zinc-800" />

            <Button
              asChild
              variant="primary"
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl h-auto shadow-lg shadow-zinc-900/10 dark:shadow-white/10"
            >
              <Link
                href="/listings/create"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Plus size={18} />
                List a Room
              </Link>
            </Button>

            {!user && (
              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/login"
                  className="w-full text-center text-zinc-600 dark:text-zinc-400 py-3 font-medium hover:text-zinc-900 dark:hover:text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Log In
                </Link>
                <Button
                  asChild
                  variant="secondary"
                  className="w-full py-3 rounded-xl h-auto"
                >
                  <Link
                    href="/signup"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </Button>
              </div>
            )}

            {user && (
              <button
                onClick={() => {
                  signOut({ callbackUrl: "/" });
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 text-red-600 dark:text-red-500 py-3 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl mt-4"
              >
                <LogOut size={18} />
                Log out
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
    </header>
  );
}
