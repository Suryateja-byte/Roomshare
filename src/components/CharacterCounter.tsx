import { cn } from '@/lib/utils';

interface CharacterCounterProps {
    current: number;
    max: number;
    className?: string;
    showWarningAt?: number; // Percentage at which to show warning color (default 80)
}

export default function CharacterCounter({
    current,
    max,
    className,
    showWarningAt = 80
}: CharacterCounterProps) {
    const percentage = (current / max) * 100;
    const isWarning = percentage >= showWarningAt && percentage < 100;
    const isOver = current > max;
    const isNearLimit = percentage >= 95 && percentage <= 100;

    return (
        <div data-testid="char-counter" className={cn('flex items-center justify-end gap-1 text-xs', className)}>
            <span
                className={cn(
                    'tabular-nums transition-colors',
                    isOver
                        ? 'text-red-500 font-medium'
                        : isNearLimit
                            ? 'text-amber-500 font-medium'
                            : isWarning
                                ? 'text-amber-500/80'
                                : 'text-zinc-400 dark:text-zinc-500'
                )}
            >
                {current}
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-400 dark:text-zinc-500">{max}</span>
        </div>
    );
}
