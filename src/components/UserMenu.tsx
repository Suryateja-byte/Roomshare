"use client";

import { User } from "next-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

interface UserMenuProps {
  user: User;
}

export default function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Escape key closes menu
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  // Focus first menu item when opened
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const firstItem = menuRef.current.querySelector<HTMLElement>(
      '[role="menuitem"]'
    );
    firstItem?.focus();
  }, [isOpen]);

  // Arrow key navigation within menu
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!menuRef.current) return;
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const current = document.activeElement as HTMLElement;
    const idx = items.indexOf(current);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      // Trap focus — close menu on Tab to keep keyboard flow predictable
      close();
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="user-menu"
        aria-label="User menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 p-1 pr-3 min-h-[44px] rounded-full border border-border hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
          {user.name?.[0]?.toUpperCase() || "U"}
        </div>
        <span className="text-sm font-medium hidden md:block">{user.name}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={close}
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="User menu"
            onKeyDown={handleMenuKeyDown}
            className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-2 space-y-1">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                {user.email}
              </div>
              <Link
                href="/profile"
                role="menuitem"
                tabIndex={0}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                onClick={close}
              >
                <UserIcon className="w-4 h-4" />
                Profile
              </Link>
              <button
                role="menuitem"
                tabIndex={0}
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-red-500/10 text-red-500 transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
