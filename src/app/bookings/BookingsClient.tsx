'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Calendar,
    CalendarDays,
    MapPin,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronRight,
    User,
    Home,
    DollarSign,
    List,
    Loader2,
    WifiOff,
    Filter,
    AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { updateBookingStatus, BookingStatus } from '@/app/actions/manage-booking';
import UserAvatar from '@/components/UserAvatar';
import BookingCalendar from '@/components/BookingCalendar';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Booking = {
    id: string;
    startDate: Date;
    endDate: Date;
    status: BookingStatus;
    totalPrice: number;
    createdAt: Date;
    listing: {
        id: string;
        title: string;
        price: number;
        location: {
            city: string;
            state: string;
        } | null;
        owner?: {
            id: string;
            name: string | null;
            image: string | null;
        };
    };
    tenant?: {
        id: string;
        name: string | null;
        image: string | null;
        email: string | null;
    };
};

interface BookingsClientProps {
    sentBookings: Booking[];
    receivedBookings: Booking[];
}

const statusConfig = {
    PENDING: {
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
        icon: Clock,
        label: 'Pending'
    },
    ACCEPTED: {
        color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        icon: CheckCircle2,
        label: 'Accepted'
    },
    REJECTED: {
        color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        icon: XCircle,
        label: 'Rejected'
    },
    CANCELLED: {
        color: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
        icon: AlertCircle,
        label: 'Cancelled'
    }
};

function StatusBadge({ status }: { status: BookingStatus }) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${config.color}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    );
}

function formatDate(date: Date) {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function BookingCard({
    booking,
    type,
    onStatusUpdate,
    isOffline
}: {
    booking: Booking;
    type: 'sent' | 'received';
    onStatusUpdate: (bookingId: string, status: BookingStatus) => Promise<void>;
    isOffline: boolean;
}) {
    const [updatingStatus, setUpdatingStatus] = useState<BookingStatus | null>(null);
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const handleStatusUpdate = async (status: BookingStatus) => {
        if (isOffline) {
            toast.error("You're offline", {
                description: 'Please check your internet connection to update booking status.'
            });
            return;
        }
        setUpdatingStatus(status);
        await onStatusUpdate(booking.id, status);
        setUpdatingStatus(null);
    };

    const isUpdating = updatingStatus !== null;

    const locationText = booking.listing.location
        ? `${booking.listing.location.city}, ${booking.listing.location.state}`
        : 'Location not specified';

    const showActions = type === 'received' && booking.status === 'PENDING';
    const showCancelButton = type === 'sent' && (booking.status === 'PENDING' || booking.status === 'ACCEPTED');

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                        <Link
                            href={`/listings/${booking.listing.id}`}
                            className="text-lg font-bold text-zinc-900 dark:text-white hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        >
                            {booking.listing.title}
                        </Link>
                        <p className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {locationText}
                        </p>
                    </div>
                    <StatusBadge status={booking.status} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-zinc-100 dark:border-zinc-800">
                    <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-medium mb-1">Check-in</p>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            {formatDate(booking.startDate)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-medium mb-1">Check-out</p>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            {formatDate(booking.endDate)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-medium mb-1">Total Price</p>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                            ${booking.totalPrice.toFixed(2)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-medium mb-1">
                            {type === 'sent' ? 'Host' : 'Tenant'}
                        </p>
                        {type === 'sent' && booking.listing.owner ? (
                            <Link
                                href={`/users/${booking.listing.owner.id}`}
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                            >
                                <UserAvatar
                                    image={booking.listing.owner.image}
                                    name={booking.listing.owner.name}
                                    className="w-6 h-6"
                                />
                                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                                    {booking.listing.owner.name || 'Host'}
                                </span>
                            </Link>
                        ) : type === 'received' && booking.tenant ? (
                            <Link
                                href={`/users/${booking.tenant.id}`}
                                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                            >
                                <UserAvatar
                                    image={booking.tenant.image}
                                    name={booking.tenant.name}
                                    className="w-6 h-6"
                                />
                                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                                    {booking.tenant.name || 'Tenant'}
                                </span>
                            </Link>
                        ) : (
                            <span className="text-sm text-zinc-400">N/A</span>
                        )}
                    </div>
                </div>

                {(showActions || showCancelButton) && (
                    <div className="flex gap-3 mt-4">
                        {showActions && (
                            <>
                                <Button
                                    onClick={() => handleStatusUpdate('ACCEPTED')}
                                    disabled={isUpdating}
                                    className="flex-1"
                                >
                                    {updatingStatus === 'ACCEPTED' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Accepting...
                                        </>
                                    ) : (
                                        'Accept'
                                    )}
                                </Button>
                                <Button
                                    onClick={() => handleStatusUpdate('REJECTED')}
                                    disabled={isUpdating}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    {updatingStatus === 'REJECTED' ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Rejecting...
                                        </>
                                    ) : (
                                        'Reject'
                                    )}
                                </Button>
                            </>
                        )}
                        {showCancelButton && (
                            <Button
                                onClick={() => setShowCancelDialog(true)}
                                disabled={isUpdating}
                                variant="destructive"
                                className="flex-1"
                            >
                                {updatingStatus === 'CANCELLED' ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    'Cancel Booking'
                                )}
                            </Button>
                        )}
                    </div>
                )}

                {/* Cancel Confirmation Dialog */}
                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                </div>
                                <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                            </div>
                            <AlertDialogDescription className="text-left">
                                <span className="block mb-2">You&apos;re about to cancel your booking for:</span>
                                <span className="block font-semibold text-zinc-900 dark:text-white">{booking.listing.title}</span>
                                <span className="block text-sm mt-1">
                                    {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
                                </span>
                                <span className="block text-sm mt-3 text-red-600 dark:text-red-400">
                                    This action cannot be undone.
                                </span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isUpdating}>Keep Booking</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    setShowCancelDialog(false);
                                    handleStatusUpdate('CANCELLED');
                                }}
                                disabled={isUpdating}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                {isUpdating ? 'Cancelling...' : 'Yes, Cancel Booking'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <p className="text-xs text-zinc-400 mt-4">
                    Requested on {formatDate(booking.createdAt)}
                </p>
            </div>
        </div>
    );
}

export default function BookingsClient({ sentBookings, receivedBookings }: BookingsClientProps) {
    const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
    const [bookings, setBookings] = useState({ sent: sentBookings, received: receivedBookings });
    const { isOffline } = useNetworkStatus();

    const handleStatusUpdate = async (bookingId: string, status: BookingStatus) => {
        // Store previous state for rollback
        const previousBookings = { ...bookings };

        // Optimistically update local state immediately
        setBookings(prev => ({
            sent: prev.sent.map(b =>
                b.id === bookingId ? { ...b, status } : b
            ),
            received: prev.received.map(b =>
                b.id === bookingId ? { ...b, status } : b
            )
        }));

        // Then make the API call
        const result = await updateBookingStatus(bookingId, status);

        if (result.error) {
            // Revert to previous state on error
            setBookings(previousBookings);
            toast.error(result.error);
            return;
        }

        // Show success feedback
        toast.success(`Booking ${status.toLowerCase()}`);
    };

    const allBookings = activeTab === 'sent' ? bookings.sent : bookings.received;
    const currentBookings = statusFilter === 'ALL'
        ? allBookings
        : allBookings.filter(b => b.status === statusFilter);
    const pendingReceivedCount = bookings.received.filter(b => b.status === 'PENDING').length;

    // Status filter options with counts
    const statusOptions: { value: BookingStatus | 'ALL'; label: string; count: number }[] = [
        { value: 'ALL', label: 'All', count: allBookings.length },
        { value: 'PENDING', label: 'Pending', count: allBookings.filter(b => b.status === 'PENDING').length },
        { value: 'ACCEPTED', label: 'Accepted', count: allBookings.filter(b => b.status === 'ACCEPTED').length },
        { value: 'REJECTED', label: 'Rejected', count: allBookings.filter(b => b.status === 'REJECTED').length },
        { value: 'CANCELLED', label: 'Cancelled', count: allBookings.filter(b => b.status === 'CANCELLED').length },
    ];

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 pt-20 pb-20">
            <div className="container mx-auto max-w-4xl px-6 py-10">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">My Bookings</h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">Manage your booking requests and reservations</p>
                </div>

                {/* Offline Banner */}
                {isOffline && (
                    <div className="mb-6 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center gap-3">
                        <WifiOff className="w-5 h-5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            You&apos;re offline. Booking actions are disabled until you reconnect.
                        </p>
                    </div>
                )}

                {/* Tabs and View Toggle */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex gap-2 bg-white dark:bg-zinc-900 p-1.5 rounded-xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                        <button
                            onClick={() => setActiveTab('received')}
                            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'received'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <Home className="w-4 h-4" />
                                Received
                                {pendingReceivedCount > 0 && (
                                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                        {pendingReceivedCount}
                                    </span>
                                )}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('sent')}
                            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'sent'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Sent
                            </span>
                        </button>
                    </div>

                    {/* View Mode Toggle */}
                    {activeTab === 'received' && (
                        <div className="flex gap-1 bg-white dark:bg-zinc-900 p-1 rounded-lg border border-zinc-100 dark:border-zinc-800 shadow-sm">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                    : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                                    }`}
                                title="List view"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'calendar'
                                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                    : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                                    }`}
                                title="Calendar view"
                            >
                                <CalendarDays className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Status Filter Chips */}
                {allBookings.length > 0 && viewMode === 'list' && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        <div className="flex items-center gap-1 mr-2 text-zinc-500 dark:text-zinc-400">
                            <Filter className="w-4 h-4" />
                            <span className="text-sm font-medium">Filter:</span>
                        </div>
                        {statusOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => setStatusFilter(option.value)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${statusFilter === option.value
                                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                {option.label}
                                {option.count > 0 && (
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === option.value
                                        ? 'bg-white/20 dark:bg-zinc-900/20'
                                        : 'bg-zinc-100 dark:bg-zinc-700'
                                        }`}>
                                        {option.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Calendar View for Received Bookings */}
                {activeTab === 'received' && viewMode === 'calendar' && (
                    <div
                        key="calendar"
                        className="animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                        <BookingCalendar
                            bookings={bookings.received.map(b => ({
                                id: b.id,
                                startDate: new Date(b.startDate),
                                endDate: new Date(b.endDate),
                                status: b.status,
                                tenant: {
                                    id: b.tenant?.id || '',
                                    name: b.tenant?.name || null,
                                    image: b.tenant?.image || null
                                },
                                listing: {
                                    id: b.listing.id,
                                    title: b.listing.title
                                }
                            }))}
                        />
                    </div>
                )}

                {/* List View */}
                {(activeTab === 'sent' || viewMode === 'list') && (
                    <div
                        key={activeTab}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                        {currentBookings.length === 0 ? (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm p-12 text-center">
                                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    {activeTab === 'received' ? (
                                        <Home className="w-8 h-8 text-zinc-400" />
                                    ) : (
                                        <Calendar className="w-8 h-8 text-zinc-400" />
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
                                    {activeTab === 'received'
                                        ? 'No booking requests yet'
                                        : 'No bookings made yet'}
                                </h3>
                                <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                                    {activeTab === 'received'
                                        ? 'When tenants request to book your listings, they will appear here.'
                                        : 'When you request to book a room, it will appear here.'}
                                </p>
                                <Link href="/search">
                                    <Button>
                                        {activeTab === 'received' ? 'List a Room' : 'Find a Room'}
                                        <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {currentBookings.map(booking => (
                                    <BookingCard
                                        key={booking.id}
                                        booking={booking}
                                        type={activeTab}
                                        onStatusUpdate={handleStatusUpdate}
                                        isOffline={isOffline}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
