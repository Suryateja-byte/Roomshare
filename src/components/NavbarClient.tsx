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
  User,
  LogOut,
  Settings,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";
import NotificationCenter from "@/components/NotificationCenter";

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
          <span className="animate-[pulse-ring_2s_ease-in-out_infinite] absolute inline-flex h-full w-full rounded-full bg-primary opacity-50"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary border border-surface-container-lowest"></span>
        </span>
      )}
    </>
  );

  const className =
    "p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2";

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
  const className = `w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
    danger
      ? "text-red-600 hover:bg-red-50"
      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
  }`;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span
          className={
            danger ? "text-red-500" : "text-on-surface-variant"
          }
        >
          {icon}
        </span>
        {text}
      </div>
      {badge && (
        <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-lg text-xs font-bold">
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
          ? "py-4 glass-nav"
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
            <div className="w-9 h-9 bg-on-surface rounded-lg flex items-center justify-center text-surface-container-lowest font-bold text-xl transition-all duration-500 group-hover:rotate-[10deg] group-hover:scale-110 shadow-ambient shadow-on-surface/10">
              R
            </div>
            <span className="text-xl font-display font-semibold tracking-[-0.03em] text-on-surface hidden sm:block">
              RoomShare
              <span className="text-primary">.</span>
            </span>
          </Link>

          {/* --- CENTER: Navigation Links --- */}
          <div className="hidden lg:flex flex-1 items-center justify-center gap-1">
            <Link
              href="/search"
              className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
                pathname === "/search"
                  ? "text-on-surface bg-surface-container-high"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
              aria-current={pathname === "/search" ? "page" : undefined}
            >
              Find a Room
            </Link>
            <Link
              href="/about"
              className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
                pathname === "/about"
                  ? "text-on-surface bg-surface-container-high"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
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
                      ? "bg-surface-container-high"
                      : "hover:bg-surface-canvas"
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
                    className={`transition-colors duration-300 ${isProfileOpen ? "text-on-surface" : "text-on-surface-variant"}`}
                  />
                </button>

                {/* Dropdown Menu - CSS animated, WAI-ARIA Menu Button pattern */}
                <div
                  id={menuId}
                  role="menu"
                  aria-labelledby={menuButtonId}
                  onKeyDown={handleMenuKeyDown}
                  className={`absolute right-0 mt-4 w-72 bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient shadow-on-surface/10 overflow-hidden origin-top-right z-sticky transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isProfileOpen
                      ? "opacity-100 translate-y-0 visible scale-100"
                      : "opacity-0 -translate-y-4 invisible scale-95 pointer-events-none"
                  }`}
                >
                  <div
                    role="none"
                    className="p-6 bg-surface-container-high/40"
                  >
                    <p className="font-semibold text-on-surface tracking-tight">
                      {user.name}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">
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
                      className="h-px bg-surface-container-high my-2 mx-3"
                    ></div>
                    <MenuItem
                      icon={<Settings size={16} />}
                      text="Settings"
                      href="/settings"
                      onClick={() => setIsProfileOpen(false)}
                      tabIndex={activeMenuIndex === 3 ? 0 : -1}
                      onMouseEnter={() => setActiveMenuIndex(3)}
                    />
                    <div
                      role="separator"
                      className="h-px bg-surface-container-high my-2 mx-3"
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
                  className="text-sm font-medium text-on-surface-variant hover:text-on-surface px-4 py-2 transition-all duration-300 rounded-full hover:bg-surface-container-high"
                >
                  Log in
                </Link>
                <Button
                  asChild
                  size="sm"
                  className="rounded-full px-6 h-10 shadow-ambient shadow-on-surface/10"
                >
                  <Link href="/signup">Join</Link>
                </Button>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <div className="lg:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-on-surface p-2 transition-colors hover:bg-surface-container-high rounded-full focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Full-screen glassmorphism overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-modal bg-surface-canvas/80 backdrop-blur-[20px] transition-all duration-300 ${
          isMobileMenuOpen
            ? "opacity-100 visible"
            : "opacity-0 invisible pointer-events-none"
        }`}
        role="dialog"
        aria-modal={isMobileMenuOpen}
        aria-label="Navigation menu"
        aria-hidden={!isMobileMenuOpen}
        inert={!isMobileMenuOpen || undefined}
      >
        <div className="flex flex-col h-full">
          {/* Close button */}
          <div className="flex justify-end p-6">
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-on-surface p-2 hover:bg-surface-container-high rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16 space-y-8">
            <Link
              href="/search"
              className="font-display text-3xl font-medium text-on-surface hover:text-primary tracking-tight transition-colors duration-300"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-current={pathname === "/search" ? "page" : undefined}
            >
              Find a Room
            </Link>

            {user && (
              <>
                <Link
                  href="/messages"
                  className="font-display text-3xl font-medium text-on-surface hover:text-primary tracking-tight transition-colors duration-300 relative"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Messages
                  {currentUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-6 bg-primary text-on-primary text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full font-body">
                      {currentUnreadCount > 9 ? "9+" : currentUnreadCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/bookings"
                  className="font-display text-3xl font-medium text-on-surface hover:text-primary tracking-tight transition-colors duration-300"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Bookings
                </Link>
                <Link
                  href="/saved"
                  className="font-display text-3xl font-medium text-on-surface hover:text-primary tracking-tight transition-colors duration-300"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Saved
                </Link>
                <Link
                  href="/profile"
                  className="font-display text-3xl font-medium text-on-surface hover:text-primary tracking-tight transition-colors duration-300"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Profile
                </Link>
              </>
            )}

            <Button
              asChild
              className="rounded-full px-10 h-14 text-lg shadow-ambient mt-4"
            >
              <Link
                href={user ? "/listings/create" : "/signup"}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {user ? "List a Room" : "Join RoomShare"}
              </Link>
            </Button>

            {!user && (
              <Link
                href="/login"
                className="text-on-surface-variant hover:text-on-surface font-medium transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Already have an account? Log in
              </Link>
            )}

            {user && (
              <button
                onClick={() => {
                  signOut({ callbackUrl: "/" });
                  setIsMobileMenuOpen(false);
                }}
                className="text-on-surface-variant hover:text-primary font-medium transition-colors mt-4"
              >
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
