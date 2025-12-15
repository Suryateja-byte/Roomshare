import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "w-full bg-zinc-50 hover:bg-zinc-100 focus:bg-white border border-zinc-200 rounded-xl px-4 py-3 sm:py-3.5 text-zinc-900 placeholder:text-zinc-400 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 focus:border-zinc-900 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 text-base touch-target dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:focus:bg-zinc-900 dark:border-zinc-700 dark:text-white dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-400/20 dark:focus:border-zinc-500",
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
