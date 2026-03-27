import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const variantClasses = {
  default: "bg-surface-container-high text-on-surface-variant",
  success:
    "bg-green-100 text-green-700",
  warning:
    "bg-amber-100 text-amber-700",
  destructive: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  purple:
    "bg-tertiary/10 text-tertiary",
  outline:
    "border border-outline-variant/20 text-on-surface-variant bg-transparent",
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-2xs",
  default: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

const baseClasses =
  "inline-flex items-center font-medium rounded-full transition-colors uppercase tracking-[0.05em]";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export function badgeVariants({
  variant = "default",
  size = "default",
  className = "",
}: {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  className?: string;
} = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={badgeVariants({ variant, size, className })}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
