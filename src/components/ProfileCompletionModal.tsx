"use client";

import { useEffect } from "react";
import { X, AlertCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { FocusTrap } from "@/components/ui/FocusTrap";

interface ProfileCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: string;
  percentage: number;
  required: number;
  missing: string[];
}

export default function ProfileCompletionModal({
  isOpen,
  onClose,
  action,
  percentage,
  required,
  missing,
}: ProfileCompletionModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-completion-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-on-surface/50" onClick={onClose} />

      {/* Modal */}
      <FocusTrap active={isOpen}>
        <div className="relative bg-surface-container-lowest rounded-2xl shadow-ambient-lg max-w-md w-full p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface-variant transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-sm"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2
                id="profile-completion-title"
                className="text-lg font-semibold text-on-surface"
              >
                Complete Your Profile
              </h2>
              <p className="text-sm text-on-surface-variant">
                {action} requires {required}% profile completion
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-on-surface-variant">Current progress</span>
              <span className="font-medium text-on-surface">{percentage}%</span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  percentage >= required ? "bg-green-500" : "bg-amber-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              You need {required - percentage}% more to {action.toLowerCase()}
            </p>
          </div>

          {/* Missing items */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-on-surface-variant mb-3">
              What&apos;s missing:
            </h3>
            <ul className="space-y-2">
              {missing.map((item, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-sm text-on-surface-variant"
                >
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-outline-variant/20 text-on-surface-variant rounded-lg font-medium hover:bg-surface-canvas transition-colors"
            >
              Cancel
            </button>
            <Link
              href="/profile/edit"
              className="flex-1 px-4 py-2.5 bg-on-surface text-white rounded-lg font-medium hover:bg-on-surface transition-colors flex items-center justify-center gap-2"
            >
              Complete Profile
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
