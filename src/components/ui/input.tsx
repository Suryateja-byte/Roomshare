import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 sm:py-3.5 text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:outline-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/10 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/10 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 text-base touch-target",
          className
        )}
        ref={ref}
        suppressHydrationWarning
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
