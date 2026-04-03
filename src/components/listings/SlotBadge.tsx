import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SlotBadgeProps {
  availableSlots: number;
  totalSlots: number;
  overlay?: boolean;
  className?: string;
}

const overlayBase =
  "bg-surface-container-lowest/90 backdrop-blur-sm shadow-ambient-sm rounded-lg";

const overlayText = {
  success: "text-green-700",
  info: "text-blue-700",
  destructive: "text-red-700",
} as const;

type StatusVariant = keyof typeof overlayText;

function getSlotStatus(
  available: number,
  total: number
): { label: string; variant: StatusVariant } {
  if (total <= 1) {
    return available > 0
      ? { label: "Available", variant: "success" }
      : { label: "Filled", variant: "destructive" };
  }

  if (available === 0) return { label: "Filled", variant: "destructive" };
  if (available === total)
    return { label: `All ${total} open`, variant: "success" };
  return { label: `${available} of ${total} open`, variant: "info" };
}

export function SlotBadge({
  availableSlots,
  totalSlots,
  overlay,
  className,
}: SlotBadgeProps) {
  const safeTotalSlots = Math.max(totalSlots, 1);
  const safeAvailableSlots = Math.max(
    0,
    Math.min(availableSlots, safeTotalSlots)
  );
  const { label, variant } = getSlotStatus(safeAvailableSlots, safeTotalSlots);

  if (overlay) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium px-2.5 py-1 text-xs",
          overlayBase,
          overlayText[variant],
          className
        )}
        data-testid="slot-badge"
      >
        {variant === "success" && (
          <svg
            className="w-3 h-3 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {variant === "destructive" && (
          <svg
            className="w-3 h-3 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {variant === "info" && (
          <svg
            className="w-3 h-3 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
        {label}
      </span>
    );
  }

  return (
    <Badge
      variant={variant}
      className={cn("gap-1", className)}
      data-testid="slot-badge"
    >
      {variant === "success" && (
        <svg
          className="w-3 h-3 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {variant === "destructive" && (
        <svg
          className="w-3 h-3 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
      {variant === "info" && (
        <svg
          className="w-3 h-3 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
        </svg>
      )}
      {label}
    </Badge>
  );
}
