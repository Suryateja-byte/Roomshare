import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const variantClasses = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm hover:shadow-md focus-visible:ring-zinc-900/30 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 dark:focus-visible:ring-zinc-400/40",
    outline: "border border-zinc-200 bg-transparent hover:bg-zinc-50 text-zinc-900 focus-visible:ring-zinc-900/30 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-400/40",
    ghost: "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-900/30 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-400/40",
    white: "bg-white text-zinc-900 hover:bg-zinc-50 shadow-sm border border-zinc-100 focus-visible:ring-zinc-900/30 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 dark:border-zinc-700 dark:focus-visible:ring-zinc-400/40",
    destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-600/30",
    success: "bg-green-600 text-white hover:bg-green-700 shadow-sm focus-visible:ring-green-600/30",
    warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-sm focus-visible:ring-amber-500/30",
    accent: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 focus-visible:ring-indigo-600/30",
    "accent-ghost": "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950 focus-visible:ring-indigo-600/30",
    secondary: "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-zinc-400/40",
    "ghost-inverse": "text-zinc-400 hover:text-white hover:bg-white/10 focus-visible:ring-white/30",
    filter: "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 data-[active=true]:bg-zinc-900 data-[active=true]:text-white data-[active=true]:border-zinc-900 focus-visible:ring-zinc-900/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:data-[active=true]:bg-white dark:data-[active=true]:text-zinc-900 dark:data-[active=true]:border-white dark:focus-visible:ring-zinc-400/40",
}

const sizeClasses = {
    default: "h-11 min-h-[44px] px-4 py-2 text-sm",
    sm: "h-11 min-h-[44px] px-3 text-xs",
    lg: "h-12 sm:h-14 min-h-[44px] px-6 sm:px-10 text-sm sm:text-base",
    icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0",
}

const baseClasses = "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean
    variant?: keyof typeof variantClasses
    size?: keyof typeof sizeClasses
}

export function buttonVariants({
    variant = "primary",
    size = "default",
    className = "",
}: { variant?: keyof typeof variantClasses; size?: keyof typeof sizeClasses; className?: string } = {}) {
    return cn(baseClasses, variantClasses[variant], sizeClasses[size], className)
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "default", asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={buttonVariants({ variant, size, className })}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
