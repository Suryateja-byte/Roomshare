import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses = {
  info: {
    container: "bg-surface-container-lowest border-outline-variant/20",
    icon: "text-primary",
    title: "text-on-surface",
    body: "text-on-surface-variant",
  },
  warning: {
    container: "bg-surface-container-high/70 border-outline-variant/20",
    icon: "text-tertiary",
    title: "text-on-surface",
    body: "text-on-surface-variant",
  },
  error: {
    container: "bg-surface-container-lowest border-outline-variant/20",
    icon: "text-destructive",
    title: "text-on-surface",
    body: "text-destructive",
  },
  success: {
    container: "bg-surface-container-lowest border-outline-variant/20",
    icon: "text-success",
    title: "text-on-surface",
    body: "text-on-surface-variant",
  },
  neutral: {
    container: "bg-surface-container-lowest border-outline-variant/20",
    icon: "text-on-surface-variant",
    title: "text-on-surface",
    body: "text-on-surface-variant",
  },
};

export interface StatusNoticeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: keyof typeof variantClasses;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  contentClassName?: string;
}

const StatusNotice = React.forwardRef<HTMLDivElement, StatusNoticeProps>(
  (
    {
      variant = "neutral",
      icon,
      title,
      actions,
      children,
      className,
      contentClassName,
      ...props
    },
    ref
  ) => {
    const styles = variantClasses[variant];

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border px-4 py-4 shadow-ambient-sm",
          styles.container,
          className
        )}
        {...props}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon ? (
              <div className={cn("mt-0.5 flex-shrink-0", styles.icon)}>
                {icon}
              </div>
            ) : null}
            <div className={cn("min-w-0", contentClassName)}>
              {title ? (
                <p className={cn("text-sm font-medium", styles.title)}>
                  {title}
                </p>
              ) : null}
              {children ? (
                <div
                  className={cn(
                    "text-sm",
                    title ? "mt-1" : "",
                    styles.body
                  )}
                >
                  {children}
                </div>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);
StatusNotice.displayName = "StatusNotice";

export { StatusNotice };
