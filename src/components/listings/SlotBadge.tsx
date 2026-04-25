import { Badge } from "@/components/ui/badge";
import {
  getAvailabilityPresentation,
  type AvailabilityPresentationState,
  type AvailabilityPublicAvailability,
} from "@/lib/search/availability-presentation";
import { cn } from "@/lib/utils";

/**
 * Subset of ResolvedPublicAvailability the badge reads. SearchV2ListItem
 * declares publicAvailability as the narrower PublicAvailability shape, but
 * the runtime object threaded through transform.ts includes the resolved
 * freshness fields. We accept both and treat the freshness fields as
 * optional at the component boundary (CFM-603).
 */
export type SlotBadgePublicAvailability = AvailabilityPublicAvailability;

interface SlotBadgeProps {
  /**
   * Legacy fallback. When publicAvailability is present, its openSlots /
   * totalSlots take precedence (CFM-603).
   */
  availableSlots: number;
  totalSlots: number;
  /**
   * Normalized availability contract from CFM-202/404. When present, the
   * badge derives its label from publicStatus + freshnessBucket so the
   * displayed text stays consistent with list / map / detail surfaces.
   */
  publicAvailability?: SlotBadgePublicAvailability;
  overlay?: boolean;
  className?: string;
  labelOverride?: string;
}

const overlayBase =
  "bg-surface-container-lowest/90 backdrop-blur-sm shadow-ambient-sm rounded-lg";

const overlayText = {
  success: "text-green-700",
  info: "text-blue-700",
  destructive: "text-red-700",
  warning: "text-amber-700",
  neutral: "text-on-surface-variant",
} as const;

type StatusVariant = keyof typeof overlayText;

interface ResolvedStatus {
  label: string;
  variant: StatusVariant;
}

function toStatusVariant(state: AvailabilityPresentationState): StatusVariant {
  switch (state) {
    case "needs-reconfirmation":
      return "warning";
    case "closed":
    case "paused":
      return "neutral";
    case "full":
    case "filled":
      return "destructive";
    case "partial":
      return "info";
    default:
      return "success";
  }
}

export function SlotBadge({
  availableSlots,
  totalSlots,
  publicAvailability,
  overlay,
  className,
  labelOverride,
}: SlotBadgeProps) {
  const presentation = getAvailabilityPresentation({
    availableSlots,
    totalSlots,
    publicAvailability,
  });

  let label = presentation.primaryLabel;
  let variant = toStatusVariant(presentation.state);

  if (labelOverride) {
    label = labelOverride;
  }

  if (overlay) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium px-2.5 py-1 text-xs",
          overlayBase,
          overlayText[variant],
          className
        )}
        data-testid="slot-badge"
      >
        <StatusIcon variant={variant} />
        {label}
      </span>
    );
  }

  return (
    <Badge
      variant={toBadgeVariant(variant)}
      className={cn("gap-1", className)}
      data-testid="slot-badge"
    >
      <StatusIcon variant={variant} />
      {label}
    </Badge>
  );
}

function toBadgeVariant(
  variant: StatusVariant
): "success" | "info" | "destructive" {
  // Existing Badge component accepts success | info | destructive; map
  // the freshness-aware variants onto the closest existing tone so we
  // don't churn the design-token surface in this commit.
  if (variant === "warning") return "info";
  if (variant === "neutral") return "info";
  return variant;
}

function StatusIcon({ variant }: { variant: StatusVariant }) {
  if (variant === "success") {
    return (
      <svg
        className="w-3 h-3 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (variant === "destructive") {
    return (
      <svg
        className="w-3 h-3 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  if (variant === "warning") {
    return (
      <svg
        className="w-3 h-3 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
    );
  }

  if (variant === "neutral") {
    return (
      <svg
        className="w-3 h-3 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    );
  }

  // info variant (partial availability)
  return (
    <svg
      className="w-3 h-3 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
