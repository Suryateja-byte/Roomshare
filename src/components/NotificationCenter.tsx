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
    CheckCheck
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
    LISTING_SAVED: Heart
};

const notificationColors: Record<NotificationType, string> = {
    BOOKING_REQUEST: 'bg-blue-100 text-blue-600',
    BOOKING_ACCEPTED: 'bg-green-100 text-green-600',
    BOOKING_REJECTED: 'bg-red-100 text-red-600',
    BOOKING_CANCELLED: 'bg-zinc-100 text-zinc-600',
    NEW_MESSAGE: 'bg-purple-100 text-purple-600',
    NEW_REVIEW: 'bg-yellow-100 text-yellow-600',
    LISTING_SAVED: 'bg-pink-100 text-pink-600'
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
                className="relative p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-all"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-zinc-100 overflow-hidden z-[1100] animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllAsRead}
                                className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors"
                            >
                                <CheckCheck className="w-3 h-3" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {isLoading && notifications.length === 0 ? (
                            <div className="p-8 text-center text-zinc-400">
                                Loading...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                                <p className="text-zinc-500 text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map((notification) => {
                                const Icon = notificationIcons[notification.type] || Bell;
                                const colorClass = notificationColors[notification.type] || 'bg-zinc-100 text-zinc-600';

                                const content = (
                                    <div
                                        className={`px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 transition-colors ${!notification.read ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                                    >
                                        <div className="flex gap-3">
                                            <div className={`p-2 rounded-lg ${colorClass} shrink-0`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-zinc-900 truncate`}>
                                                    {notification.title}
                                                </p>
                                                <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
                                                    {notification.message}
                                                </p>
                                                <p className="text-[10px] text-zinc-400 mt-1">
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
                        <div className="px-4 py-3 border-t border-zinc-100">
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
