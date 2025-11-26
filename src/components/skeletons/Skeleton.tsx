import { type HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string | number;
  height?: string | number;
  animation?: "pulse" | "shimmer" | "none";
}

export function Skeleton({
  variant = "text",
  width,
  height,
  animation = "pulse",
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const baseClasses = "bg-zinc-200 ";

  const variantClasses = {
    text: "rounded h-4 w-full",
    circular: "rounded-full",
    rectangular: "",
    rounded: "rounded-lg",
  };

  const animationClasses = {
    pulse: "animate-pulse",
    shimmer: "animate-shimmer bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 bg-[length:200%_100%]",
    none: "",
  };

  const computedStyle = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    ...style,
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={computedStyle}
      aria-hidden="true"
      role="presentation"
      {...props}
    />
  );
}

// Convenience components for common skeleton patterns
export function TextSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" role="presentation">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? "75%" : "100%"}
        />
      ))}
    </div>
  );
}

export function AvatarSkeleton({ size = 40 }: { size?: number }) {
  return <Skeleton variant="circular" width={size} height={size} />;
}

export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-white p-4 ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      <div className="flex items-center gap-3 mb-4">
        <AvatarSkeleton />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <Skeleton variant="rounded" height={160} className="mb-4" />
      <TextSkeleton lines={2} />
    </div>
  );
}

export function ListItemSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 ${className}`}
      aria-hidden="true"
      role="presentation"
    >
      <AvatarSkeleton size={32} />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="50%" height={12} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 4, className = "" }: { columns?: number; className?: string }) {
  return (
    <tr className={className} aria-hidden="true" role="presentation">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton variant="text" width={`${60 + Math.random() * 30}%`} />
        </td>
      ))}
    </tr>
  );
}

export function ImageSkeleton({
  width = "100%",
  height = 200,
  className = ""
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
}) {
  return (
    <Skeleton
      variant="rounded"
      width={width}
      height={height}
      className={className}
    />
  );
}
