"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Camera,
  FileText,
  Globe,
  ShieldCheck,
  User,
  ChevronRight,
} from "lucide-react";

interface ProfileData {
  name?: string | null;
  image?: string | null;
  bio?: string | null;
  countryOfOrigin?: string | null;
  languages?: string[];
  isVerified?: boolean;
}

interface ProfileCompletionIndicatorProps {
  profile: ProfileData;
  variant?: "full" | "compact";
}

interface CompletionStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  href: string;
  priority: number;
}

export default function ProfileCompletionIndicator({
  profile,
  variant = "full",
}: ProfileCompletionIndicatorProps) {
  const steps: CompletionStep[] = useMemo(
    () => [
      {
        id: "name",
        label: "Add your name",
        description: "Let others know what to call you",
        icon: <User className="w-4 h-4" />,
        completed: !!profile.name,
        href: "/profile/edit",
        priority: 1,
      },
      {
        id: "photo",
        label: "Upload a photo",
        description: "Help build trust with a profile picture",
        icon: <Camera className="w-4 h-4" />,
        completed: !!profile.image,
        href: "/profile/edit",
        priority: 2,
      },
      {
        id: "bio",
        label: "Write a bio",
        description: "Tell others about yourself",
        icon: <FileText className="w-4 h-4" />,
        completed: !!profile.bio && profile.bio.length > 20,
        href: "/profile/edit",
        priority: 3,
      },
      {
        id: "country",
        label: "Add your country",
        description: "Share where you're from",
        icon: <Globe className="w-4 h-4" />,
        completed: !!profile.countryOfOrigin,
        href: "/profile/edit",
        priority: 4,
      },
      {
        id: "languages",
        label: "Add languages",
        description: "Let others know what languages you speak",
        icon: <Globe className="w-4 h-4" />,
        completed: (profile.languages?.length || 0) > 0,
        href: "/profile/edit",
        priority: 5,
      },
      {
        id: "verification",
        label: "Get verified",
        description: "Build trust with ID verification",
        icon: <ShieldCheck className="w-4 h-4" />,
        completed: !!profile.isVerified,
        href: "/verify",
        priority: 6,
      },
    ],
    [profile]
  );

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  const nextStep = steps
    .filter((s) => !s.completed)
    .sort((a, b) => a.priority - b.priority)[0];

  if (variant === "compact") {
    return (
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-on-surface">
            Profile Completion
          </span>
          <span className="text-sm font-bold text-on-surface">
            {percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              percentage === 100 ? "bg-green-500" : "bg-on-surface"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Next Step */}
        {nextStep && (
          <Link
            href={nextStep.href}
            className="flex items-center justify-between mt-3 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="flex items-center gap-2">
              {nextStep.icon}
              {nextStep.label}
            </span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-outline-variant/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-on-surface">
            Complete Your Profile
          </h3>
          <span
            className={`text-sm font-bold ${
              percentage === 100
                ? "text-green-600"
                : "text-on-surface"
            }`}
          >
            {percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              percentage === 100 ? "bg-green-500" : "bg-on-surface"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <p className="text-sm text-on-surface-variant mt-2">
          {percentage === 100
            ? "Great job! Your profile is complete."
            : `${completedCount} of ${totalCount} steps completed`}
        </p>
      </div>

      {/* Steps */}
      <div className="divide-y divide-outline-variant/20">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className={`flex items-center gap-4 px-6 py-4 transition-colors ${
              step.completed
                ? "bg-surface-canvas"
                : "hover:bg-surface-canvas"
            }`}
          >
            {/* Status Icon */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                step.completed
                  ? "bg-green-100 text-green-600"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {step.completed ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                step.icon
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p
                className={`font-medium ${
                  step.completed
                    ? "text-on-surface-variant line-through"
                    : "text-on-surface"
                }`}
              >
                {step.label}
              </p>
              <p className="text-sm text-on-surface-variant truncate">
                {step.description}
              </p>
            </div>

            {/* Arrow for incomplete */}
            {!step.completed && (
              <ChevronRight className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
