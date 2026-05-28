"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ChevronRight, ShieldCheck } from "lucide-react";

export default function ProfileWarningBanner() {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-outline-variant/20 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-amber-100 rounded-lg">
          <ShieldCheck className="w-5 h-5 text-amber-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Build trust with renters
              </h3>
              <p className="text-sm text-amber-700 mt-0.5">
                You can publish now. Completing your profile or getting identity
                verified can help renters trust your listing.
              </p>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 p-1 text-amber-500 hover:text-amber-700 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Link
            href="/profile/edit"
            className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            Improve profile
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
