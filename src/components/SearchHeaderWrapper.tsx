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

import {
  useCallback,
  useState,
  useRef,
  useEffect,
  useId,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Menu,
  User,
  Plus,
  Heart,
  Settings,
  LogOut,
  SlidersHorizontal,
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
import { countActiveFilters } from "@/components/filters/filter-chip-utils";



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

  const searchParams = useSearchParams();
  const activeCount = countActiveFilters(searchParams);

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
      <div
        className={`transition-all duration-300 ease-out hidden md:block`}
      >
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Logo — always visible */}
            <Link
              href="/"
              className="flex items-center cursor-pointer group flex-shrink-0 mr-1 sm:mr-2 md:mr-4"
              aria-label="RoomShare Home"
            >
              <div className="w-9 h-9 bg-on-surface rounded-lg flex items-center justify-center text-surface-container-lowest font-bold text-xl transition-all duration-500 group-hover:rotate-[10deg] group-hover:scale-110 shadow-ambient shadow-on-surface/10">
                R
              </div>
            </Link>

            {/* Desktop header search — mobile keeps the full-screen overlay flow */}
            <div className="flex-1 min-w-0 relative hidden md:flex justify-center">
              <DesktopHeaderSearch
                ref={desktopSearchRef}
                collapsed={isCollapsed}
              />
            </div>

            {/* Right Actions - User Profile / Auth */}
            <div className="hidden lg:flex items-center gap-2 flex-shrink-0 ml-2">
              <div className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={openFilters}
                  aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
                  aria-expanded="false"
                  aria-controls="search-filters"
                  aria-haspopup="dialog"
                  className={`flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-full text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 border ${
                    activeCount > 0
                      ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                      : "bg-surface-container-lowest text-on-surface border-outline-variant/50 hover:border-on-surface-variant hover:bg-surface-container-high/50"
                  }`}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {activeCount > 0 ? (
                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-on-primary text-[11px] font-bold">
                      {activeCount}
                    </span>
                  ) : null}
                </button>
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
                    className="text-sm font-medium text-on-surface-variant hover:text-on-surface px-4 py-2 transition-all duration-300 rounded-full hover:bg-surface-container-high"
                  >
                    Log in
                  </Link>
                  <Link href="/signup">
                    <Button
                      size="sm"
                      className="rounded-full px-6 h-10 shadow-ambient shadow-on-surface/10"
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
