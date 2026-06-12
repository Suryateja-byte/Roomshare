"use client";

/**
 * SearchHeaderWrapper - Manages collapsible header on mobile and desktop
 *
 * On mobile:
 * - Shows the full search bar when at top or manually expanded
 * - Shows collapsed bar when scrolled down
 * - Collapsed bar shows location summary and filter access
 *
 * On desktop:
 * - Shows the full search bar when at top or manually expanded
 * - Shows compact search pill when scrolled down
 */

import { useCallback, useState, useRef, useEffect, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  User,
  Plus,
  Heart,
  Settings,
  LogOut,
  Bookmark,
  MessageSquare,
} from "lucide-react";
import { useScrollHeader } from "@/hooks/useScrollHeader";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import CollapsedMobileSearch from "@/components/CollapsedMobileSearch";
import MobileSearchOverlay from "@/components/search/MobileSearchOverlay";
import DesktopHeaderSearch, {
  type DesktopHeaderSearchHandle,
} from "@/components/search/DesktopHeaderSearch";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";

const MenuItem = ({
  icon,
  text,
  danger,
  onClick,
  href,
  role: ariaRole = "menuitem",
  tabIndex = -1,
  onMouseEnter,
}: {
  icon: React.ReactNode;
  text: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
  role?: string;
  tabIndex?: number;
  onMouseEnter?: () => void;
}) => {
  const className = `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
    danger
      ? "text-red-600 hover:bg-red-50"
      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
  }`;

  const content = (
    <>
      <span className={danger ? "text-red-500" : "text-on-surface-variant"}>
        {icon}
      </span>
      {text}
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

export default function SearchHeaderWrapper() {
  const { isCollapsed } = useScrollHeader({ threshold: 80 });
  const { openFilters } = useMobileSearch();
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
  const { data: session } = useSession();
  const user = session?.user;
  const desktopSearchRef = useRef<DesktopHeaderSearchHandle>(null);
  const mobileExpandButtonRef = useRef<HTMLButtonElement>(null);

  // Full-screen mobile search overlay (Option A — Airbnb pattern)
  const [isMobileOverlayOpen, setIsMobileOverlayOpen] = useState(false);
  const handleOpenMobileSearch = useCallback(
    () => setIsMobileOverlayOpen(true),
    []
  );
  const handleCloseMobileSearch = useCallback(() => {
    setIsMobileOverlayOpen(false);
    window.requestAnimationFrame(() => {
      mobileExpandButtonRef.current?.focus();
    });
  }, []);

  const menuButtonId = useId();
  const menuId = useId();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeMenuIndex, setActiveMenuIndex] = useState(-1);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<HTMLElement[]>([]);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isProfileOpen) {
          setIsProfileOpen(false);
          triggerButtonRef.current?.focus();
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileOpen]);

  // Dynamically update --header-height CSS variable to ensure perfect layout spacing
  // regardless of responsive wrapping inside the search form.
  useEffect(() => {
    const updateHeaderHeight = () => {
      // Find the parent <header> element (which is in layout.tsx)
      const headerEl = document.querySelector("header");
      if (headerEl) {
        document.documentElement.style.setProperty(
          "--header-height",
          `${headerEl.offsetHeight}px`
        );
      }
    };

    // Initial update
    updateHeaderHeight();

    // Create an observer
    const headerEl = document.querySelector("header");
    if (!headerEl) return;

    const observer = new ResizeObserver(() => {
      // Use requestAnimationFrame to avoid ResizeObserver loop limit errors
      window.requestAnimationFrame(updateHeaderHeight);
    });

    observer.observe(headerEl);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Collect menu items when dropdown opens
  useEffect(() => {
    if (isProfileOpen) {
      requestAnimationFrame(() => {
        const menuEl = document.getElementById(menuId);
        if (menuEl) {
          const items =
            menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]');
          menuItemsRef.current = Array.from(items);
        }
      });
    } else {
      menuItemsRef.current = [];
      setActiveMenuIndex(-1);
    }
  }, [isProfileOpen, menuId]);

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      action: () => {
        if (isMobileViewport === true) {
          handleOpenMobileSearch();
          return;
        }
        desktopSearchRef.current?.openAndFocus("where");
      },
      description: "Open search",
    },
  ]);

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
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const items = document
                .getElementById(menuId)
                ?.querySelectorAll<HTMLElement>('[role="menuitem"]');
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
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const items = document
                .getElementById(menuId)
                ?.querySelectorAll<HTMLElement>('[role="menuitem"]');
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
    <>
      {/* Full search form - hidden on mobile always, hidden on desktop when collapsed */}
      <div className="hidden transition-all duration-300 ease-out md:block">
        <div className="mx-auto w-full max-w-[1920px] px-4 py-4 xl:px-8">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 xl:grid-cols-[auto_minmax(620px,1120px)_auto] xl:gap-6">
            {/* Logo — always visible */}
            <Link
              href="/"
              className="group flex h-12 w-16 flex-shrink-0 items-center justify-start xl:w-[132px]"
              aria-label="RoomShare Home"
            >
              <Image
                src="/images/home/rs-logo.svg"
                alt=""
                width={47}
                height={38}
                priority
                className="h-9 w-auto transition-transform duration-300 group-hover:scale-[1.04]"
              />
            </Link>

            {/* Desktop header search — mobile keeps the full-screen overlay flow */}
            <div className="relative hidden min-w-0 justify-center md:flex">
              <DesktopHeaderSearch
                ref={desktopSearchRef}
                collapsed={isCollapsed}
              />
            </div>

            {/* Right Actions - User Profile / Auth */}
            <div className="hidden min-w-max items-center justify-end gap-3 xl:flex">
              {user ? (
                <>
                  <Link
                    href="/listings/create"
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-on-surface),#3a241c)] px-4 text-sm font-semibold text-surface-container-lowest shadow-ghost transition-all duration-200 hover:brightness-105 active:scale-[0.98]"
                    aria-label="List a room"
                  >
                    <Plus size={15} aria-hidden />
                    <span>List a room</span>
                  </Link>
                  <Link
                    href="/saved"
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-lowest/92 text-on-surface-variant shadow-ghost transition-colors hover:bg-surface-container-high/60 hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                    aria-label="Shortlist"
                  >
                    <Bookmark size={17} aria-hidden />
                  </Link>
                  <Link
                    href="/messages"
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/20 bg-surface-container-lowest/92 text-on-surface-variant shadow-ghost transition-colors hover:bg-surface-container-high/60 hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
                    aria-label="Messages"
                  >
                    <MessageSquare size={17} aria-hidden />
                  </Link>
                </>
              ) : null}
              {/* Profile Dropdown / Auth Buttons */}
              {user ? (
                <div className="relative" ref={profileRef}>
                  <button
                    ref={triggerButtonRef}
                    id={menuButtonId}
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    onKeyDown={handleTriggerKeyDown}
                    className={`group flex h-11 items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-lowest/92 p-1 pl-2 pr-1 shadow-ghost transition-all duration-300 ${
                      isProfileOpen
                        ? "border-on-surface-variant bg-surface-container-high"
                        : "hover:border-on-surface-variant hover:bg-surface-canvas"
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

                  {/* Dropdown Menu - WAI-ARIA Menu Button pattern */}
                  <div
                    id={menuId}
                    role="menu"
                    aria-labelledby={menuButtonId}
                    onKeyDown={handleMenuKeyDown}
                    className={`absolute right-0 mt-4 w-72 bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient shadow-on-surface/10 overflow-hidden origin-top-right z-[1200] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
                        tabIndex={activeMenuIndex === 4 ? 0 : -1}
                        onMouseEnter={() => setActiveMenuIndex(4)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Link
                    href="/login"
                    className="rounded-full px-4 py-2 text-sm font-semibold text-on-surface transition-all duration-300 hover:bg-surface-container-high"
                  >
                    Log in
                  </Link>
                  <Link href="/signup">
                    <Button
                      size="sm"
                      className="h-11 rounded-full bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] px-7 text-sm font-semibold shadow-[0_16px_34px_-18px_rgba(154,64,39,0.72)] hover:brightness-105"
                    >
                      Join
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsed search bar - always visible on mobile, hidden on desktop */}
      <div className="transition-all duration-300 ease-out md:hidden block py-2">
        <CollapsedMobileSearch
          onExpand={handleOpenMobileSearch}
          onOpenFilters={openFilters}
          expandButtonRef={mobileExpandButtonRef}
        />
      </div>

      {/* Full-screen mobile search overlay (Option A) */}
      <MobileSearchOverlay
        isOpen={isMobileOverlayOpen}
        onClose={handleCloseMobileSearch}
        onOpenFilters={openFilters}
      />
    </>
  );
}
