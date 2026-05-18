"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ChevronRight, User } from "lucide-react";
import { StatusNotice } from "@/components/ui/status-notice";

interface ProfileWarningBannerProps {
  percentage: number;
  missing: string[];
}

export default function ProfileWarningBanner({
  percentage,
  missing,
}: ProfileWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  // Only show if profile is less than 60% complete
  if (percentage >= 60) return null;

  return (
    <StatusNotice
      variant="warning"
      icon={<User className="w-5 h-5" />}
      title="Complete your profile for better results"
      className="mb-6"
      contentClassName="flex-1"
      actions={
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="flex-shrink-0 p-1 text-on-surface-variant transition-colors hover:text-on-surface"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      }
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface-variant">
          Listings from complete profiles get 3x more inquiries.
        </p>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-tertiary">
              Profile {percentage}% complete
            </span>
            <span className="text-on-surface-variant">
              {missing.length} items remaining
            </span>
          </div>
          <div className="w-full bg-surface-container-high rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Quick tips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {missing.slice(0, 2).map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
            >
              {item}
            </span>
          ))}
          {missing.length > 2 && (
            <span className="text-xs text-on-surface-variant">
              +{missing.length - 2} more
            </span>
          )}
        </div>

        {/* CTA */}
        <Link
          href="/profile/edit"
          className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-primary hover:text-primary-container transition-colors"
        >
          Complete profile
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </StatusNotice>
  );
}
