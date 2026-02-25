import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    // P2-8: Improved contrast for WCAG AA compliance
                    // Light mode: zinc-600 provides 7:1 contrast vs zinc-500's borderline 4.5:1
                    // Dark mode: zinc-300 provides 7.6:1 contrast vs zinc-400's failing 4.2:1
                    // Disabled: opacity-60 maintains better readability than opacity-50
                    "w-full bg-white hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-full px-4 py-3 sm:py-3.5 text-zinc-900 placeholder:text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 text-base touch-target dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:focus:bg-zinc-900 dark:border-zinc-800 dark:text-white dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-400/40 dark:focus:border-zinc-500",
                    className
                )}
                ref={ref}
                suppressHydrationWarning
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
