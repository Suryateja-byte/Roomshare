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
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  minDate,
  disabled = false,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
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

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

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

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        id={id}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
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
            "z-popover p-4",
            "bg-surface-container-lowest/95 backdrop-blur-[20px]",
            "rounded-lg",
            "shadow-ambient",
            "animate-in fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=top]:slide-in-from-bottom-2"
          )}
          sideOffset={8}
          align="start"
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

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((day) => (
              <div
                key={day}
                className="h-8 flex items-center justify-center text-xs font-medium text-on-surface-variant uppercase tracking-[0.05em]"
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
                  disabled={disabled || day.isDisabled}
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
              );
            })}
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
