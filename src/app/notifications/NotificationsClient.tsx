"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Calendar,
  MessageSquare,
  Star,
  Heart,
  Check,
  X,
  Clock,
  CheckCheck,
  Trash2,
  Search,
  AlertTriangle,
} from "lucide-react";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  getMoreNotifications,
} from "@/app/actions/notifications";
import type { NotificationType } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  BOOKING_HOLD_EXPIRED: Clock,
  NEW_MESSAGE: MessageSquare,
  NEW_REVIEW: Star,
  LISTING_SAVED: Heart,
  SEARCH_ALERT: Search,
  LISTING_FRESHNESS_REMINDER: Clock,
  LISTING_STALE_WARNING: AlertTriangle,
  LISTING_AUTO_PAUSED: AlertTriangle,
};

const notificationColors: Record<NotificationType, string> = {
  BOOKING_REQUEST: "bg-blue-100 text-blue-600",
  BOOKING_ACCEPTED: "bg-green-100 text-green-600",
  BOOKING_REJECTED: "bg-red-100 text-red-600",
  BOOKING_CANCELLED: "bg-surface-container-high text-on-surface-variant",
  BOOKING_HOLD_REQUEST: "bg-amber-100 text-amber-600",
  BOOKING_EXPIRED: "bg-surface-container-high text-on-surface-variant",
  BOOKING_HOLD_EXPIRED: "bg-amber-100 text-amber-600",
  NEW_MESSAGE: "bg-purple-100 text-purple-600",
  NEW_REVIEW: "bg-yellow-100 text-yellow-600",
  LISTING_SAVED: "bg-pink-100 text-pink-600",
  SEARCH_ALERT: "bg-orange-100 text-orange-600",
  LISTING_FRESHNESS_REMINDER: "bg-sky-100 text-sky-700",
  LISTING_STALE_WARNING: "bg-amber-100 text-amber-700",
  LISTING_AUTO_PAUSED: "bg-amber-100 text-amber-700",
};

function formatDate(date: Date) {
  const now = new Date();
  const notifDate = new Date(date);
  const diff = now.getTime() - notifDate.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return notifDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return notifDate.toLocaleDateString("en-US", { weekday: "long" });
  } else {
    return notifDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

interface NotificationsClientProps {
  initialNotifications: Notification[];
  initialHasMore: boolean;
}

export default function NotificationsClient({
  initialNotifications,
  initialHasMore,
}: NotificationsClientProps) {
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications =
    filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const handleMarkAsRead = async (notificationId: string) => {
    await markNotificationAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    await markAllNotificationsAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleDelete = async (notificationId: string) => {
    await deleteNotification(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || notifications.length === 0) return;

    setIsLoadingMore(true);
    const lastNotification = notifications[notifications.length - 1];
    const result = await getMoreNotifications(lastNotification.id);

    if (result.notifications.length > 0) {
      setNotifications((prev) => [...prev, ...result.notifications]);
    }
    setHasMore(result.hasMore);
    setIsLoadingMore(false);
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const result = await deleteAllNotifications();
      if ("error" in result) {
        console.error(result.error);
      } else {
        setNotifications([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to delete all notifications:", error);
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllDialog(false);
    }
  };

  return (
    <div
      data-testid="notifications-page"
      className="min-h-svh bg-surface-canvas pt-4 pb-20"
    >
      <div className="container mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface tracking-tight">
              Notifications
            </h1>
            <p className="text-on-surface-variant mt-1">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "All caught up!"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              data-testid="mark-all-read-button"
              variant="outline"
              onClick={handleMarkAllAsRead}
            >
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteAllDialog(true)}
              className="text-red-600 border-outline-variant/20 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete all
            </Button>
          )}
        </div>

        {/* Filters */}
        <div data-testid="filter-tabs" className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-canvas"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === "unread"
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest border border-outline-variant/20 text-on-surface-variant hover:bg-surface-canvas"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-ambient-sm overflow-hidden">
          {filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold text-on-surface mb-2">
                {filter === "unread"
                  ? "No unread notifications"
                  : "No notifications yet"}
              </h3>
              <p className="text-on-surface-variant">
                {filter === "unread"
                  ? "You're all caught up!"
                  : "When you get notifications, they'll show up here."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredNotifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell;
                const colorClass =
                  notificationColors[notification.type] ||
                  "bg-surface-container-high text-on-surface-variant";

                return (
                  <div
                    key={notification.id}
                    data-testid="notification-item"
                    className={`p-4 hover:bg-surface-container-high transition-colors ${!notification.read ? "bg-blue-50/30" : ""}`}
                  >
                    <div className="flex gap-4">
                      <div className={`p-3 rounded-xl ${colorClass} shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {notification.link ? (
                          <Link href={notification.link}>
                            <h4
                              className={`text-sm ${!notification.read ? "font-semibold" : "font-medium"} text-on-surface hover:underline`}
                            >
                              {notification.title}
                            </h4>
                          </Link>
                        ) : (
                          <h4
                            className={`text-sm ${!notification.read ? "font-semibold" : "font-medium"} text-on-surface`}
                          >
                            {notification.title}
                          </h4>
                        )}
                        <p className="text-sm text-on-surface-variant mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-2">
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        {!notification.read && (
                          <button
                            data-testid="mark-read-button"
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          data-testid="delete-button"
                          onClick={() => handleDelete(notification.id)}
                          className="p-2 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Load More Button */}
        {hasMore && filter === "all" && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="min-w-[140px]"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}

        {/* Delete All Confirmation Dialog */}
        <AlertDialog
          open={showDeleteAllDialog}
          onOpenChange={setShowDeleteAllDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <AlertDialogTitle>Delete all notifications?</AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                This will permanently delete all {notifications.length}{" "}
                notification{notifications.length !== 1 ? "s" : ""}. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingAll}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
