import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { LucideIcon } from "lucide-react"

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: LucideIcon
    iconClassName?: string
    title: string
    description?: string
    action?: React.ReactNode
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
    ({ className, icon: Icon, iconClassName, title, description, action, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn("flex flex-col items-center justify-center text-center py-12 px-4", className)}
                {...props}
            >
                {Icon && (
                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                        <Icon className={cn("w-8 h-8 text-zinc-400 dark:text-zinc-500", iconClassName)} />
                    </div>
                )}
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{title}</h3>
                {description && (
                    <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mb-4">{description}</p>
                )}
                {action && <div className="mt-2">{action}</div>}
                {children}
            </div>
        )
    }
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
