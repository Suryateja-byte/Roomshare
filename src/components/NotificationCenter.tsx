'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
    Bell,
    Calendar,
    MessageSquare,
    Star,
    Heart,
    Check,
    X,
    CheckCheck,
    Search
} from 'lucide-react';
import {
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    NotificationType
} from '@/app/actions/notifications';
import { Button } from '@/components/ui/button';

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
    NEW_MESSAGE: MessageSquare,
    NEW_REVIEW: Star,
    LISTING_SAVED: Heart,
    SEARCH_ALERT: Search
};

const notificationColors: Record<NotificationType, string> = {
    BOOKING_REQUEST: 'bg-blue-100 text-blue-600',
    BOOKING_ACCEPTED: 'bg-green-100 text-green-600',
    BOOKING_REJECTED: 'bg-red-100 text-red-600',
    BOOKING_CANCELLED: 'bg-zinc-100 text-zinc-600',
    NEW_MESSAGE: 'bg-purple-100 text-purple-600',
    NEW_REVIEW: 'bg-yellow-100 text-yellow-600',
    LISTING_SAVED: 'bg-pink-100 text-pink-600',
    SEARCH_ALERT: 'bg-orange-100 text-orange-600'
};

function formatTimeAgo(date: Date) {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
}

export default function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        setIsLoading(true);
        const result = await getNotifications(20);
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchNotifications();
        // Poll for new notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (notificationId: string) => {
        await markNotificationAsRead(notificationId);
        setNotifications(prev =>
            prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleMarkAllAsRead = async () => {
        await markAllNotificationsAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all"
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-2xs font-bold flex items-center justify-center rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden z-sticky animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-900 dark:text-white">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                            >
                                <CheckCheck className="w-3 h-3" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {isLoading && notifications.length === 0 ? (
                            <div className="p-8 text-center text-zinc-400 dark:text-zinc-500">
                                Loading...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Bell className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                                </div>
                                <h4 className="font-medium text-zinc-900 dark:text-white mb-1">You&apos;re all caught up!</h4>
                                <p className="text-zinc-500 dark:text-zinc-400 text-sm">No new notifications at the moment.</p>
                            </div>
                        ) : (
                            notifications.map((notification) => {
                                const Icon = notificationIcons[notification.type] || Bell;
                                const colorClass = notificationColors[notification.type] || 'bg-zinc-100 text-zinc-600';

                                const content = (
                                    <div
                                        className={`px-4 py-3 border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${!notification.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                                        onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                                    >
                                        <div className="flex gap-3">
                                            <div className={`p-2 rounded-lg ${colorClass} shrink-0`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-zinc-900 dark:text-white truncate`}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                                    {notification.message}
                                                </p>
                                                <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-1">
                                                    {formatTimeAgo(notification.createdAt)}
                                                </p>
                                            </div>
                                            {!notification.read && (
                                                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                                            )}
                                        </div>
                                    </div>
                                );

                                if (notification.link) {
                                    return (
                                        <Link
                                            key={notification.id}
                                            href={notification.link}
                                            onClick={() => setIsOpen(false)}
                                        >
                                            {content}
                                        </Link>
                                    );
                                }

                                return <div key={notification.id}>{content}</div>;
                            })
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                            <Link href="/notifications" onClick={() => setIsOpen(false)}>
                                <Button variant="ghost" className="w-full text-sm">
                                    View all notifications
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
