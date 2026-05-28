"use client";

import { Shield, ShieldCheck } from "lucide-react";
import type { HostIdentityStatus } from "@/lib/search-types";
import { cn } from "@/lib/utils";

interface HostIdentityBadgeProps {
  status?: HostIdentityStatus | null;
  className?: string;
  compact?: boolean;
}

export default function HostIdentityBadge({
  status,
  className,
  compact = false,
}: HostIdentityBadgeProps) {
  if (status !== "verified" && status !== "unverified") return null;

  const isVerified = status === "verified";
  const Icon = isVerified ? ShieldCheck : Shield;
  const label = isVerified
    ? "Identity verified host"
    : "Host not identity verified";

  return (
    <span
      data-testid="host-identity-badge"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full min-w-0 self-start items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        isVerified
          ? "border-primary/15 bg-primary/10 text-primary"
          : "border-outline-variant/20 bg-surface-container-high/60 text-on-surface-variant",
        compact && "px-2 py-0.5 text-[11px]",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
