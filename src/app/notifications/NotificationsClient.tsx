'use client';

import { useState } from 'react';
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
    Trash2,
    Search
} from 'lucide-react';
import {
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    getMoreNotifications,
    NotificationType
} from '@/app/actions/notifications';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

function formatDate(date: Date) {
    const now = new Date();
    const notifDate = new Date(date);
    const diff = now.getTime() - notifDate.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return notifDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return notifDate.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
        return notifDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

interface NotificationsClientProps {
    initialNotifications: Notification[];
    initialHasMore: boolean;
}

export default function NotificationsClient({ initialNotifications, initialHasMore }: NotificationsClientProps) {
    const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const unreadCount = notifications.filter(n => !n.read).length;
    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications;

    const handleMarkAsRead = async (notificationId: string) => {
        await markNotificationAsRead(notificationId);
        setNotifications(prev =>
            prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
    };

    const handleMarkAllAsRead = async () => {
        await markAllNotificationsAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handleDelete = async (notificationId: string) => {
        await deleteNotification(notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
    };

    const handleLoadMore = async () => {
        if (isLoadingMore || !hasMore || notifications.length === 0) return;

        setIsLoadingMore(true);
        const lastNotification = notifications[notifications.length - 1];
        const result = await getMoreNotifications(lastNotification.id);

        if (result.notifications.length > 0) {
            setNotifications(prev => [...prev, ...result.notifications]);
        }
        setHasMore(result.hasMore);
        setIsLoadingMore(false);
    };

    return (
        <div className="min-h-screen bg-zinc-50/50 pt-24 pb-20">
            <div className="container mx-auto max-w-3xl px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Notifications</h1>
                        <p className="text-zinc-500 mt-1">
                            {unreadCount > 0
                                ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                                : 'All caught up!'
                            }
                        </p>
                    </div>
                    {unreadCount > 0 && (
                        <Button variant="outline" onClick={handleMarkAllAsRead}>
                            <CheckCheck className="w-4 h-4 mr-2" />
                            Mark all read
                        </Button>
                    )}
                </div>

                {/* Filters */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('unread')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'unread'
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            }`}
                    >
                        Unread ({unreadCount})
                    </button>
                </div>

                {/* Notifications List */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                    {filteredNotifications.length === 0 ? (
                        <div className="p-12 text-center">
                            <Bell className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                            </h3>
                            <p className="text-zinc-500">
                                {filter === 'unread'
                                    ? 'You\'re all caught up!'
                                    : 'When you get notifications, they\'ll show up here.'
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-100">
                            {filteredNotifications.map((notification) => {
                                const Icon = notificationIcons[notification.type] || Bell;
                                const colorClass = notificationColors[notification.type] || 'bg-zinc-100 text-zinc-600';

                                return (
                                    <div
                                        key={notification.id}
                                        className={`p-4 hover:bg-zinc-50 transition-colors ${!notification.read ? 'bg-blue-50/30' : ''}`}
                                    >
                                        <div className="flex gap-4">
                                            <div className={`p-3 rounded-xl ${colorClass} shrink-0`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {notification.link ? (
                                                    <Link href={notification.link}>
                                                        <h4 className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-zinc-900 hover:underline`}>
                                                            {notification.title}
                                                        </h4>
                                                    </Link>
                                                ) : (
                                                    <h4 className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-zinc-900`}>
                                                        {notification.title}
                                                    </h4>
                                                )}
                                                <p className="text-sm text-zinc-500 mt-1">
                                                    {notification.message}
                                                </p>
                                                <p className="text-xs text-zinc-400 mt-2">
                                                    {formatDate(notification.createdAt)}
                                                </p>
                                            </div>
                                            <div className="flex items-start gap-2 shrink-0">
                                                {!notification.read && (
                                                    <button
                                                        onClick={() => handleMarkAsRead(notification.id)}
                                                        className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                                                        title="Mark as read"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(notification.id)}
                                                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                {hasMore && filter === 'all' && (
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
                                'Load more'
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
