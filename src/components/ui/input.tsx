import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-4 py-3 sm:py-3.5 text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 text-base touch-target",
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
