import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const variantClasses = {
  primary:
    "bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-ambient hover:brightness-110 focus-visible:ring-primary/30",
  outline:
    "bg-transparent border border-outline-variant/20 text-on-surface hover:bg-surface-container-high focus-visible:ring-primary/30",
  ghost:
    "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high focus-visible:ring-primary/30",
  white:
    "bg-surface-container-lowest text-on-surface shadow-ambient-sm focus-visible:ring-primary/30",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 shadow-ambient-sm focus-visible:ring-red-600/30",
  success:
    "bg-green-600 text-white hover:bg-green-700 shadow-ambient-sm focus-visible:ring-green-600/30",
  warning:
    "bg-amber-500 text-white hover:bg-amber-600 shadow-ambient-sm focus-visible:ring-amber-500/30",
  accent:
    "bg-tertiary text-on-primary hover:bg-tertiary/90 focus-visible:ring-primary/30",
  "accent-ghost":
    "text-primary hover:bg-primary/10 focus-visible:ring-primary/30",
  secondary:
    "bg-surface-container-high text-on-surface hover:bg-surface-container-high/80 focus-visible:ring-primary/30",
  "ghost-inverse":
    "text-surface-container-high hover:text-white hover:bg-white/10 focus-visible:ring-white/30",
  filter:
    "border border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant data-[active=true]:bg-gradient-to-br data-[active=true]:from-primary data-[active=true]:to-primary-container data-[active=true]:text-on-primary focus-visible:ring-primary/30",
};

const sizeClasses = {
  default: "h-11 min-h-[44px] px-4 py-2 text-sm",
  sm: "h-11 min-h-[44px] px-3 text-xs",
  lg: "h-12 sm:h-14 min-h-[44px] px-6 sm:px-10 text-sm sm:text-base",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0",
};

// P2-8: Improved disabled opacity for better contrast (60% vs 50%)
const baseClasses =
  "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none active:scale-[0.97]";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export function buttonVariants({
  variant = "primary",
  size = "default",
  className = "",
}: {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  className?: string;
} = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
