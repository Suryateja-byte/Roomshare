"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { cn, parseLocalDate } from "@/lib/utils";

interface DatePickerProps {
  value?: string;
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const FULL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
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

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

// Move by whole months, clamping the day to the target month's last day so
// PageUp/PageDown from e.g. Mar 31 lands on Feb 28, not an overflow into March.
function addMonths(date: Date, amount: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), lastDay)
  );
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  minDate,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => {
    if (value) {
      return parseLocalDate(value);
    }
    return new Date();
  });
  // The calendar day that currently holds keyboard focus (roving tabindex).
  const [focusedDate, setFocusedDate] = React.useState<Date | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  // Set when a keyboard action should move DOM focus to the new roving day.
  const shouldFocusDayRef = React.useRef(false);

  // Prevent hydration mismatch by only rendering Popover on client
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  // After a keyboard navigation (or popover open), move DOM focus onto the
  // day that now holds the roving tabindex.
  React.useEffect(() => {
    if (!open || !shouldFocusDayRef.current) return;
    shouldFocusDayRef.current = false;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      '[data-roving="true"]'
    );
    el?.focus();
  }, [open, focusedDate, viewDate]);

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

    const days: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isDisabled: boolean;
    }> = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({
        date,
        isCurrentMonth: false,
        isDisabled: minDateObj ? date < minDateObj : false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
        isDisabled: minDateObj ? date < minDateObj : false,
      });
    }

    // Next month days to fill the grid
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isDisabled: minDateObj ? date < minDateObj : false,
      });
    }

    return days;
  };

  const handleDateSelect = (date: Date) => {
    // Use local date parts to avoid timezone conversion issues with toISOString()
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
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
    onChange("");
    setOpen(false);
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
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
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg",
          "border border-outline-variant/20",
          "bg-surface-container-lowest",
          "text-sm touch-target text-left",
          className
        )}
      >
        <span
          className={cn(value ? "text-on-surface" : "text-on-surface-variant")}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span className="p-0.5">
              <X className="w-3.5 h-3.5 text-on-surface-variant" />
            </span>
          )}
          <Calendar className="w-4 h-4 text-on-surface-variant" />
        </div>
      </button>
    );
  }

  const formatFullDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Exactly one day in the visible month carries the roving tabindex so the
  // grid is reachable with a single Tab: the focused day, else the selected
  // day, else today, else the first enabled (or first) day of the month.
  const rovingBase = focusedDate ?? selectedDate ?? today;
  const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);
  const rovingMatch =
    currentMonthDays.find((d) => isSameDay(d.date, rovingBase)) ??
    currentMonthDays.find((d) => !d.isDisabled) ??
    currentMonthDays[0];
  const rovingDate = rovingMatch ? rovingMatch.date : null;

  // Split the flat 42-cell list into week rows for proper grid semantics.
  const weeks: (typeof calendarDays)[] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const applyKeyboardFocus = (next: Date) => {
    shouldFocusDayRef.current = true;
    setFocusedDate(next);
    if (
      next.getFullYear() !== viewDate.getFullYear() ||
      next.getMonth() !== viewDate.getMonth()
    ) {
      setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const base = focusedDate ?? rovingDate ?? today;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, -1));
        break;
      case "ArrowRight":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, -7));
        break;
      case "ArrowDown":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, 7));
        break;
      case "Home":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, -base.getDay()));
        break;
      case "End":
        e.preventDefault();
        applyKeyboardFocus(addDays(base, 6 - base.getDay()));
        break;
      case "PageUp":
        e.preventDefault();
        applyKeyboardFocus(addMonths(base, -1));
        break;
      case "PageDown":
        e.preventDefault();
        applyKeyboardFocus(addMonths(base, 1));
        break;
      default:
        break;
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Reset roving focus on close so a re-open always re-seeds from the
        // selected day / today rather than a stale prior-session date.
        if (!next) setFocusedDate(null);
        setOpen(next);
      }}
    >
      <Popover.Trigger
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(
          "w-full flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-lg",
          "border border-outline-variant/20",
          "bg-surface-container-lowest",
          "hover:border-outline-variant/30",
          "focus:outline-none focus:ring-2 focus:ring-primary/30",
          "transition-all duration-200",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-outline-variant/20",
          "text-sm touch-target text-left",
          className
        )}
      >
        <span
          className={cn(value ? "text-on-surface" : "text-on-surface-variant")}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={disabled ? -1 : 0}
              onClick={(e) => {
                if (disabled) return;
                e.stopPropagation();
                handleClear();
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  handleClear();
                }
              }}
              className="p-0.5 hover:bg-surface-container-high rounded transition-colors"
            >
              <X className="w-3.5 h-3.5 text-on-surface-variant" />
            </span>
          )}
          <Calendar className="w-4 h-4 text-on-surface-variant" />
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={cn(
            "z-popover w-[min(320px,calc(100vw-32px))] p-4",
            "rounded-[1.25rem] border border-outline-variant/20",
            "bg-surface-container-lowest/98 backdrop-blur-[20px]",
            "shadow-ambient-lg shadow-on-surface/5 outline-none",
            "animate-in fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=top]:slide-in-from-bottom-2"
          )}
          sideOffset={8}
          align="start"
          onOpenAutoFocus={(e) => {
            // Override Radix's default (focus the Previous-month button) and
            // land focus on the selected day, else today, else the first
            // selectable day.
            e.preventDefault();
            const initial =
              selectedDate ?? (minDateObj && today < minDateObj ? minDateObj : today);
            setViewDate(new Date(initial.getFullYear(), initial.getMonth(), 1));
            setFocusedDate(initial);
            shouldFocusDayRef.current = true;
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevMonth();
                }}
                className="p-2 hover:bg-surface-container-high rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                aria-label="Previous month"
              >
              <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
            </button>
            <span className="text-sm font-semibold text-on-surface">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextMonth();
                }}
                className="p-2 hover:bg-surface-container-high rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                aria-label="Next month"
              >
              <ChevronRight className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>

          {/* Calendar grid */}
          <div
            ref={gridRef}
            role="grid"
            aria-label={`${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`}
            onKeyDown={handleGridKeyDown}
            className="flex flex-col gap-1"
          >
            {/* Day headers */}
            <div role="row" className="grid grid-cols-7 gap-1 mb-1">
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  role="columnheader"
                  aria-label={FULL_DAYS[i]}
                  className="h-8 flex items-center justify-center text-xs font-medium text-on-surface-variant uppercase tracking-[0.05em]"
                >
                  {day}
                </div>
              ))}
            </div>

            {weeks.map((week, weekIndex) => (
              <div role="row" key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((day, dayIndex) => {
                  const selected = isSelected(day.date);
                  const todayDate = isToday(day.date);
                  const roving = Boolean(
                    day.isCurrentMonth &&
                      rovingDate &&
                      isSameDay(day.date, rovingDate)
                  );
                  const dateKey = `${day.date.getFullYear()}-${String(
                    day.date.getMonth() + 1
                  ).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;

                  return (
                    <div
                      role="gridcell"
                      aria-selected={selected ? true : undefined}
                      key={dayIndex}
                      className="flex items-center justify-center"
                    >
                      <button
                        type="button"
                        data-date={dateKey}
                        data-roving={roving ? "true" : undefined}
                        tabIndex={roving ? 0 : -1}
                        disabled={disabled || day.isDisabled}
                        aria-label={formatFullDate(day.date)}
                        aria-current={todayDate ? "date" : undefined}
                        onClick={() => handleDateSelect(day.date)}
                        className={cn(
                          "h-9 w-9 flex items-center justify-center text-sm rounded-lg transition-all duration-200",
                          !day.isCurrentMonth && "text-on-surface-variant",
                          day.isCurrentMonth &&
                            !selected &&
                            !day.isDisabled &&
                            "text-on-surface hover:bg-surface-container-high",
                          day.isDisabled &&
                            "text-on-surface-variant cursor-not-allowed",
                          todayDate && !selected && "ring-2 ring-on-surface/20",
                          selected && "bg-primary text-on-primary font-medium"
                        )}
                      >
                        {day.date.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-container-high">
            <button
              type="button"
              disabled={disabled}
              onClick={handleClear}
              className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-on-surface-variant"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleToday}
              className="text-sm font-medium text-on-surface hover:text-on-surface-variant transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-on-surface"
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
