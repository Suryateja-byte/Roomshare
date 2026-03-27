import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const variantClasses = {
  default: "bg-surface-container-lowest",
  elevated: "bg-surface-container-lowest shadow-ambient",
  glass: "bg-surface-container-lowest/80 backdrop-blur-[20px]",
  interactive:
    "bg-surface-container-lowest hover:-translate-y-1 hover:shadow-ambient-lg transition-[transform,box-shadow] duration-300",
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  default: "p-6",
  lg: "p-6 sm:p-8 md:p-12",
};

const radiusClasses = {
  default: "rounded-lg",
  lg: "rounded-lg",
};

const baseClasses = "overflow-hidden";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variantClasses;
  padding?: keyof typeof paddingClasses;
  radius?: keyof typeof radiusClasses;
}

export function cardVariants({
  variant = "default",
  padding = "default",
  radius = "default",
  className = "",
}: {
  variant?: keyof typeof variantClasses;
  padding?: keyof typeof paddingClasses;
  radius?: keyof typeof radiusClasses;
  className?: string;
} = {}) {
  return cn(
    baseClasses,
    variantClasses[variant],
    paddingClasses[padding],
    radiusClasses[radius],
    className
  );
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "default",
      padding = "default",
      radius = "default",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cardVariants({ variant, padding, radius, className })}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold text-on-surface font-display",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-on-surface-variant", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-4", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
