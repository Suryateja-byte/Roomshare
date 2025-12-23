import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const variantClasses = {
    default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    purple: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    outline: "border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 bg-transparent",
}

const sizeClasses = {
    sm: "px-2 py-0.5 text-2xs",
    default: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
}

const baseClasses = "inline-flex items-center font-medium rounded-full transition-colors"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: keyof typeof variantClasses
    size?: keyof typeof sizeClasses
}

export function badgeVariants({
    variant = "default",
    size = "default",
    className = "",
}: { variant?: keyof typeof variantClasses; size?: keyof typeof sizeClasses; className?: string } = {}) {
    return cn(baseClasses, variantClasses[variant], sizeClasses[size], className)
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={badgeVariants({ variant, size, className })}
                {...props}
            />
        )
    }
)
Badge.displayName = "Badge"

export { Badge }
