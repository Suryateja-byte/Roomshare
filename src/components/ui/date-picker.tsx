'use client';

import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { cn, parseLocalDate } from '@/lib/utils';

interface DatePickerProps {
    value?: string;
    onChange: (date: string) => void;
    placeholder?: string;
    minDate?: string;
    className?: string;
    id?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function DatePicker({
    value,
    onChange,
    placeholder = 'Select date',
    minDate,
    className,
    id
}: DatePickerProps) {
    const [mounted, setMounted] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [viewDate, setViewDate] = React.useState(() => {
        if (value) {
            return parseLocalDate(value);
        }
        return new Date();
    });

    // Prevent hydration mismatch by only rendering Popover on client
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const selectedDate = value ? parseLocalDate(value) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const minDateObj = minDate ? parseLocalDate(minDate) : null;
    if (minDateObj) {
        minDateObj.setHours(0, 0, 0, 0);
    }

    // Get days in month
    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    // Get first day of month (0 = Sunday)
    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    // Generate calendar days
    const generateCalendarDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const daysInPrevMonth = getDaysInMonth(year, month - 1);

        const days: Array<{ date: Date; isCurrentMonth: boolean; isDisabled: boolean }> = [];

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const date = new Date(year, month - 1, daysInPrevMonth - i);
            days.push({
                date,
                isCurrentMonth: false,
                isDisabled: minDateObj ? date < minDateObj : false
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            days.push({
                date,
                isCurrentMonth: true,
                isDisabled: minDateObj ? date < minDateObj : false
            });
        }

        // Next month days to fill the grid
        const remainingDays = 42 - days.length; // 6 rows * 7 days
        for (let i = 1; i <= remainingDays; i++) {
            const date = new Date(year, month + 1, i);
            days.push({
                date,
                isCurrentMonth: false,
                isDisabled: minDateObj ? date < minDateObj : false
            });
        }

        return days;
    };

    const handleDateSelect = (date: Date) => {
        // Use local date parts to avoid timezone conversion issues with toISOString()
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        onChange(formattedDate);
        setOpen(false);
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    const handleToday = () => {
        const todayDate = new Date();
        if (!minDateObj || todayDate >= minDateObj) {
            handleDateSelect(todayDate);
        }
        setViewDate(new Date());
    };

    const handleClear = () => {
        onChange('');
        setOpen(false);
    };

    const formatDisplayDate = (dateStr: string) => {
        const date = parseLocalDate(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const isToday = (date: Date) => {
        return date.toDateString() === today.toDateString();
    };

    const isSelected = (date: Date) => {
        return selectedDate && date.toDateString() === selectedDate.toDateString();
    };

    const calendarDays = generateCalendarDays();

    // Render placeholder during SSR to prevent hydration mismatch
    if (!mounted) {
        return (
            <button
                type="button"
                id={id}
                className={cn(
                    'w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl',
                    'border border-zinc-200 dark:border-zinc-700',
                    'bg-white dark:bg-zinc-800',
                    'text-sm touch-target text-left',
                    className
                )}
            >
                <span className={cn(
                    value ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'
                )}>
                    {value ? formatDisplayDate(value) : placeholder}
                </span>
                <div className="flex items-center gap-1">
                    {value && (
                        <span className="p-0.5">
                            <X className="w-3.5 h-3.5 text-zinc-400" />
                        </span>
                    )}
                    <Calendar className="w-4 h-4 text-zinc-400" />
                </div>
            </button>
        );
    }

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                type="button"
                id={id}
                className={cn(
                    'w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl',
                    'border border-zinc-200 dark:border-zinc-700',
                    'bg-white dark:bg-zinc-800',
                    'hover:border-zinc-300 dark:hover:border-zinc-600',
                    'focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-400/20',
                    'transition-all duration-200',
                    'text-sm touch-target text-left',
                    className
                )}
            >
                <span className={cn(
                    value ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'
                )}>
                    {value ? formatDisplayDate(value) : placeholder}
                </span>
                <div className="flex items-center gap-1">
                    {value && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClear();
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation();
                                    handleClear();
                                }
                            }}
                            className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-zinc-400" />
                        </span>
                    )}
                    <Calendar className="w-4 h-4 text-zinc-400" />
                </div>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className={cn(
                        'z-popover p-4',
                        'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl',
                        'rounded-xl',
                        'shadow-lg dark:shadow-xl',
                        'border border-zinc-200/80 dark:border-zinc-700/80',
                        'animate-in fade-in-0',
                        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                        'data-[side=bottom]:slide-in-from-top-2',
                        'data-[side=top]:slide-in-from-bottom-2'
                    )}
                    sideOffset={8}
                    align="start"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </span>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            aria-label="Next month"
                        >
                            <ChevronRight className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {DAYS.map((day) => (
                            <div
                                key={day}
                                className="h-8 flex items-center justify-center text-xs font-medium text-zinc-500 dark:text-zinc-400"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                            const selected = isSelected(day.date);
                            const todayDate = isToday(day.date);

                            return (
                                <button
                                    key={index}
                                    type="button"
                                    disabled={day.isDisabled}
                                    onClick={() => handleDateSelect(day.date)}
                                    className={cn(
                                        'h-9 w-9 flex items-center justify-center text-sm rounded-xl transition-all duration-200',
                                        !day.isCurrentMonth && 'text-zinc-300 dark:text-zinc-600',
                                        day.isCurrentMonth && !selected && !day.isDisabled && 'text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800',
                                        day.isDisabled && 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed',
                                        todayDate && !selected && 'ring-2 ring-zinc-900/20 dark:ring-white/20',
                                        selected && 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium'
                                    )}
                                >
                                    {day.date.getDate()}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={handleClear}
                            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={handleToday}
                            className="text-sm font-medium text-zinc-900 dark:text-white hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                            Today
                        </button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

export default DatePicker;
