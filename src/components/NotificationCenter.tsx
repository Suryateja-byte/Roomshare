"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Calendar,
  ChevronRight,
  MessageSquare,
  Star,
  Heart,
  Check,
  X,
  Clock,
  Search,
  AlertTriangle,
} from "lucide-react";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/app/actions/notifications";
import type { NotificationType } from "@/lib/notifications";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

const notificationIcons: Record<NotificationType, typeof Bell> = {
  BOOKING_REQUEST: Calendar,
  BOOKING_ACCEPTED: Check,
  BOOKING_REJECTED: X,
  BOOKING_CANCELLED: X,
  BOOKING_HOLD_REQUEST: Clock,
  BOOKING_EXPIRED: X,
  BOOKING_HOLD_EXPIRED: X,
  NEW_MESSAGE: MessageSquare,
  NEW_REVIEW: Star,
  LISTING_SAVED: Heart,
  SEARCH_ALERT: Search,
  LISTING_FRESHNESS_REMINDER: Clock,
  LISTING_STALE_WARNING: AlertTriangle,
  LISTING_AUTO_PAUSED: AlertTriangle,
};

const notificationColors: Record<NotificationType, string> = {
  BOOKING_REQUEST: "bg-primary/10 text-primary",
  BOOKING_ACCEPTED: "bg-success/10 text-success",
  BOOKING_REJECTED: "bg-surface-container-high/70 text-on-surface-variant",
  BOOKING_CANCELLED: "bg-surface-container-high/70 text-on-surface-variant",
  BOOKING_HOLD_REQUEST: "bg-warning/10 text-tertiary",
  BOOKING_EXPIRED: "bg-surface-container-high/70 text-on-surface-variant",
  BOOKING_HOLD_EXPIRED: "bg-surface-container-high/70 text-on-surface-variant",
  NEW_MESSAGE: "bg-primary/10 text-primary",
  NEW_REVIEW: "bg-warning/10 text-tertiary",
  LISTING_SAVED: "bg-primary/10 text-primary",
  SEARCH_ALERT: "bg-warning/10 text-tertiary",
  LISTING_FRESHNESS_REMINDER: "bg-warning/10 text-tertiary",
  LISTING_STALE_WARNING: "bg-warning/10 text-tertiary",
  LISTING_AUTO_PAUSED: "bg-surface-container-high/70 text-on-surface-variant",
};

const POPOVER_NOTIFICATION_LIMIT = 5;

function formatNotificationTimestamp(date: Date) {
  const notificationDate = new Date(date);
  const dateText = notificationDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeText = notificationDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateText} • ${timeText}`;
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getNotifications(POPOVER_NOTIFICATION_LIMIT);
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch {
      // Keep the widget non-blocking if notification fetch fails
      setNotifications([]);
      setUnreadCount(0);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    fetchNotifications();
    // Poll while open to avoid background server action traffic on unrelated pages.
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAsRead = async (notificationId: string) => {
    await markNotificationAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-primary text-on-primary text-xs font-bold flex items-center justify-center rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-sticky mt-4 w-[min(calc(100vw-1.5rem),42rem)] overflow-hidden rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-lowest/95 shadow-ambient-lg backdrop-blur-[20px] animate-in fade-in zoom-in-95 duration-200 max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-20 max-sm:mt-0 max-sm:w-auto">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
            <h3 className="text-2xl font-extrabold leading-tight text-on-surface sm:text-3xl">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 sm:text-base"
              >
                <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[min(calc(100vh-14rem),30rem)] space-y-3 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
            {isLoading && notifications.length === 0 ? (
              <div className="rounded-[1rem] bg-surface-canvas px-5 py-8 text-center text-sm text-on-surface-variant">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-[1rem] bg-surface-canvas px-5 py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[1rem] bg-surface-container-high text-on-surface-variant">
                  <Bell className="h-7 w-7" />
                </div>
                <h4 className="mb-2 text-base font-bold text-on-surface">
                  You&apos;re all caught up!
                </h4>
                <p className="text-sm text-on-surface-variant">
                  No new notifications at the moment.
                </p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell;
                const colorClass =
                  notificationColors[notification.type] ||
                  "bg-surface-container-high text-on-surface-variant";

                const content = (
                  <>
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1rem] sm:h-16 sm:w-16 ${colorClass}`}
                    >
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-base leading-snug sm:text-lg ${
                              !notification.read
                                ? "font-extrabold"
                                : "font-bold"
                            } text-on-surface`}
                          >
                            {notification.title}
                          </p>
                          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.read && (
                          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-2.5 flex items-center gap-2 text-xs font-medium text-on-surface-variant sm:text-sm">
                        <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span>
                          {formatNotificationTimestamp(notification.createdAt)}
                        </span>
                      </p>
                    </div>
                  </>
                );

                if (notification.link) {
                  return (
                    <Link
                      key={notification.id}
                      href={notification.link}
                      onClick={() => {
                        if (!notification.read) {
                          void handleMarkAsRead(notification.id);
                        }
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center gap-4 rounded-[1rem] border border-outline-variant/20 bg-surface-container-lowest px-4 py-4 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.65)] transition-colors hover:bg-surface-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 sm:px-5"
                    >
                      {content}
                      <ChevronRight className="h-5 w-5 shrink-0 text-on-surface-variant" />
                    </Link>
                  );
                }

                return (
                  <button
                    key={notification.id}
                    type="button"
                    className="flex w-full items-center gap-4 rounded-[1rem] border border-outline-variant/20 bg-surface-container-lowest px-4 py-4 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.65)] transition-colors hover:bg-surface-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 sm:px-5"
                    onClick={() =>
                      !notification.read && handleMarkAsRead(notification.id)
                    }
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="bg-surface-container-lowest px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="h-px bg-outline-variant/20" />
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="mt-3 flex min-h-14 items-center justify-center gap-3 rounded-full px-4 text-base font-bold text-tertiary transition-colors hover:bg-surface-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
            >
              <Bell className="h-5 w-5 text-tertiary" />
              <span className="flex-1 text-center sm:flex-none">
                View all notifications
              </span>
              <ChevronRight className="h-5 w-5 text-on-surface-variant" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
