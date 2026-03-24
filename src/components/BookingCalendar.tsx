"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Home,
  Loader2,
} from "lucide-react";
import { parseISODateAsLocal } from "@/lib/utils";

interface Booking {
  id: string;
  startDate: Date | string; // Can be Date or ISO string from server
  endDate: Date | string; // Can be Date or ISO string from server
  status:
    | "PENDING"
    | "ACCEPTED"
    | "REJECTED"
    | "CANCELLED"
    | "HELD"
    | "EXPIRED";
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
  isLoading?: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const statusColors = {
  PENDING:
    "bg-amber-100 text-amber-700 border-amber-200",
  ACCEPTED:
    "bg-green-100 text-green-700 border-green-200",
  REJECTED:
    "bg-red-100 text-red-700 border-red-200",
  CANCELLED:
    "bg-surface-container-high text-on-surface-variant border-outline-variant/20",
  HELD: "bg-blue-100 text-blue-700 border-blue-200",
  EXPIRED:
    "bg-orange-100 text-orange-700 border-orange-200",
};

export default function BookingCalendar({
  bookings,
  onBookingClick,
  isLoading = false,
}: BookingCalendarProps) {
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
    return bookings.filter((booking) => {
      const start = parseISODateAsLocal(booking.startDate);
      const end = parseISODateAsLocal(booking.endDate);
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
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-surface-container-high/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-on-surface">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={goToToday}
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-sm"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-high rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-on-surface-variant" />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-high rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Calendar Grid */}
        <div className="flex-1 p-4 relative">
          {/* Loading overlay */}
          {isLoading && (
            <div
              className="absolute inset-0 bg-surface-container-lowest/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg"
              role="status"
              aria-label="Loading bookings"
            >
              <div className="flex flex-col items-center gap-2">
                <Loader2
                  className="w-8 h-8 text-on-surface-variant animate-spin"
                  aria-hidden="true"
                />
                <span className="text-sm text-on-surface-variant">
                  Loading bookings...
                </span>
              </div>
            </div>
          )}

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-on-surface-variant py-2"
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
              const hasPending = dayBookings.some(
                (b) => b.status === "PENDING"
              );
              const hasAccepted = dayBookings.some(
                (b) => b.status === "ACCEPTED"
              );
              const isSelected =
                selectedDate?.getDate() === day &&
                selectedDate?.getMonth() === month &&
                selectedDate?.getFullYear() === year;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(new Date(year, month, day))}
                  className={`aspect-square p-1 rounded-lg relative transition-all focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
                    isToday(day) ? "ring-2 ring-primary/30" : ""
                  } ${
                    isSelected
                      ? "bg-on-surface text-white"
                      : "text-on-surface hover:bg-surface-canvas"
                  }`}
                >
                  <span
                    className={`text-sm ${isSelected ? "font-semibold" : ""}`}
                  >
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
          <div className="flex items-center gap-4 mt-4 pt-4">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Pending
            </div>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Accepted
            </div>
          </div>
        </div>

        {/* Selected Date Details */}
        <div className="w-full md:w-80 bg-surface-container-high/20 p-4">
          {selectedDate ? (
            <>
              <h3 className="font-semibold text-on-surface mb-4">
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h3>

              {selectedDateBookings.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  No bookings on this day
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDateBookings.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => onBookingClick?.(booking)}
                      className={`w-full text-left p-3 rounded-lg border ${statusColors[booking.status]} hover:opacity-80 transition-opacity`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-3.5 h-3.5" />
                        <span className="font-medium text-sm">
                          {booking.tenant.name || "Guest"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs opacity-75">
                        <Home className="w-3 h-3" />
                        {booking.listing.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs opacity-75 mt-1">
                        <Clock className="w-3 h-3" />
                        {parseISODateAsLocal(
                          booking.startDate
                        ).toLocaleDateString()}{" "}
                        -{" "}
                        {parseISODateAsLocal(
                          booking.endDate
                        ).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-on-surface-variant">
                Select a date to view bookings
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
