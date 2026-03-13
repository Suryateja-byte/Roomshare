import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SlotBadgeProps {
  availableSlots: number;
  totalSlots: number;
  overlay?: boolean;
  className?: string;
}

const overlayBase = 'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-sm rounded-md';

const overlayText = {
  success: 'text-green-700 dark:text-green-400',
  info: 'text-blue-700 dark:text-blue-400',
  destructive: 'text-red-700 dark:text-red-400',
} as const;

type StatusVariant = keyof typeof overlayText;

function getSlotStatus(available: number, total: number): { label: string; variant: StatusVariant } {
  if (total <= 1) {
    return available > 0
      ? { label: 'Available', variant: 'success' }
      : { label: 'Filled', variant: 'destructive' };
  }

  if (available === 0) return { label: 'Filled', variant: 'destructive' };
  if (available === total) return { label: `All ${total} open`, variant: 'success' };
  return { label: `${available} of ${total} open`, variant: 'info' };
}

export function SlotBadge({ availableSlots, totalSlots, overlay, className }: SlotBadgeProps) {
  const safeTotalSlots = Math.max(totalSlots, 1);
  const safeAvailableSlots = Math.max(0, Math.min(availableSlots, safeTotalSlots));
  const { label, variant } = getSlotStatus(safeAvailableSlots, safeTotalSlots);

  if (overlay) {
    return (
      <span
        className={cn(
          'inline-flex items-center font-medium px-2.5 py-1 text-xs',
          overlayBase,
          overlayText[variant],
          className,
        )}
        data-testid="slot-badge"
      >
        {label}
      </span>
    );
  }

  return (
    <Badge variant={variant} className={className} data-testid="slot-badge">
      {label}
    </Badge>
  );
}
