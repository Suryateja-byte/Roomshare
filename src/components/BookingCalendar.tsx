'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, User, Home } from 'lucide-react';

interface Booking {
    id: string;
    startDate: Date;
    endDate: Date;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
    tenant: {
        id: string;
        name: string | null;
        image: string | null;
    };
    listing: {
        id: string;
        title: string;
    };
}

interface BookingCalendarProps {
    bookings: Booking[];
    onBookingClick?: (booking: Booking) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const statusColors = {
    PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
    ACCEPTED: 'bg-green-100 text-green-700 border-green-200',
    REJECTED: 'bg-red-100 text-red-700 border-red-200',
    CANCELLED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

export default function BookingCalendar({ bookings, onBookingClick }: BookingCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Get days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const days: (number | null)[] = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(null);
        }

        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    }, [daysInMonth, firstDayOfMonth]);

    // Get bookings for a specific date
    const getBookingsForDate = (day: number) => {
        const date = new Date(year, month, day);
        return bookings.filter(booking => {
            const start = new Date(booking.startDate);
            const end = new Date(booking.endDate);
            return date >= start && date <= end;
        });
    };

    // Navigate months
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Check if a day is today
    const isToday = (day: number) => {
        const today = new Date();
        return (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        );
    };

    // Get bookings for selected date
    const selectedDateBookings = selectedDate
        ? getBookingsForDate(selectedDate.getDate())
        : [];

    return (
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-zinc-900">
                        {MONTHS[month]} {year}
                    </h2>
                    <button
                        onClick={goToToday}
                        className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        Today
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToPreviousMonth}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-zinc-600" />
                    </button>
                    <button
                        onClick={goToNextMonth}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-zinc-600" />
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row">
                {/* Calendar Grid */}
                <div className="flex-1 p-4">
                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {DAYS.map(day => (
                            <div
                                key={day}
                                className="text-center text-xs font-medium text-zinc-500 py-2"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar days */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="aspect-square" />;
                            }

                            const dayBookings = getBookingsForDate(day);
                            const hasBookings = dayBookings.length > 0;
                            const hasPending = dayBookings.some(b => b.status === 'PENDING');
                            const hasAccepted = dayBookings.some(b => b.status === 'ACCEPTED');
                            const isSelected = selectedDate?.getDate() === day &&
                                selectedDate?.getMonth() === month &&
                                selectedDate?.getFullYear() === year;

                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDate(new Date(year, month, day))}
                                    className={`aspect-square p-1 rounded-lg relative transition-all ${isToday(day) ? 'ring-2 ring-zinc-900' : ''
                                        } ${isSelected ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-50'
                                        }`}
                                >
                                    <span className={`text-sm ${isSelected ? 'font-semibold' : ''}`}>
                                        {day}
                                    </span>

                                    {/* Booking indicators */}
                                    {hasBookings && (
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                                            {hasPending && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            )}
                                            {hasAccepted && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-100">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Pending
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            Accepted
                        </div>
                    </div>
                </div>

                {/* Selected Date Details */}
                <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-zinc-100 p-4">
                    {selectedDate ? (
                        <>
                            <h3 className="font-semibold text-zinc-900 mb-4">
                                {selectedDate.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </h3>

                            {selectedDateBookings.length === 0 ? (
                                <p className="text-sm text-zinc-500">No bookings on this day</p>
                            ) : (
                                <div className="space-y-3">
                                    {selectedDateBookings.map(booking => (
                                        <button
                                            key={booking.id}
                                            onClick={() => onBookingClick?.(booking)}
                                            className={`w-full text-left p-3 rounded-lg border ${statusColors[booking.status]} hover:opacity-80 transition-opacity`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="w-3.5 h-3.5" />
                                                <span className="font-medium text-sm">
                                                    {booking.tenant.name || 'Guest'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs opacity-75">
                                                <Home className="w-3 h-3" />
                                                {booking.listing.title}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs opacity-75 mt-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(booking.startDate).toLocaleDateString()} - {new Date(booking.endDate).toLocaleDateString()}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-sm text-zinc-500">
                                Select a date to view bookings
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
