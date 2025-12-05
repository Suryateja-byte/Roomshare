import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const variantClasses = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm hover:shadow-md focus-visible:ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 dark:focus-visible:ring-white",
    outline: "border border-zinc-200 bg-transparent hover:bg-zinc-50 text-zinc-900 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-400",
    ghost: "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-900 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800",
    white: "bg-white text-zinc-900 hover:bg-zinc-50 shadow-sm border border-zinc-100 focus-visible:ring-zinc-900 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 dark:border-zinc-700",
    destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-600",
}

const sizeClasses = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-9 px-3 text-xs",
    lg: "h-12 sm:h-14 px-6 sm:px-10 text-sm sm:text-base",
    icon: "h-10 w-10 p-0",
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
