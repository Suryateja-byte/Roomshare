import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean
    variant?: "primary" | "outline" | "ghost" | "white" | "destructive"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "default", asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(
                    "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
                    {
                        "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm hover:shadow-md focus-visible:ring-zinc-900 ": variant === "primary",
                        "border border-zinc-200 bg-transparent hover:bg-zinc-50 text-zinc-900 focus-visible:ring-zinc-900 ": variant === "outline",
                        "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-900 ": variant === "ghost",
                        "bg-white text-zinc-900 hover:bg-zinc-50 shadow-sm border border-zinc-100 focus-visible:ring-zinc-900 ": variant === "white",
                        "bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-600": variant === "destructive",
                        "h-10 px-4 py-2 text-sm": size === "default",
                        "h-9 px-3 text-xs": size === "sm",
                        "h-12 sm:h-14 px-6 sm:px-10 text-sm sm:text-base": size === "lg",
                        "h-10 w-10 p-0": size === "icon",
                    },
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
