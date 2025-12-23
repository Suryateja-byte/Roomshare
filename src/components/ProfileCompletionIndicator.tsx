'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
    CheckCircle2,
    Circle,
    Camera,
    FileText,
    Globe,
    ShieldCheck,
    User,
    ChevronRight
} from 'lucide-react';

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
    variant?: 'full' | 'compact';
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
    variant = 'full'
}: ProfileCompletionIndicatorProps) {
    const steps: CompletionStep[] = useMemo(() => [
        {
            id: 'name',
            label: 'Add your name',
            description: 'Let others know what to call you',
            icon: <User className="w-4 h-4" />,
            completed: !!profile.name,
            href: '/profile/edit',
            priority: 1
        },
        {
            id: 'photo',
            label: 'Upload a photo',
            description: 'Help build trust with a profile picture',
            icon: <Camera className="w-4 h-4" />,
            completed: !!profile.image,
            href: '/profile/edit',
            priority: 2
        },
        {
            id: 'bio',
            label: 'Write a bio',
            description: 'Tell others about yourself',
            icon: <FileText className="w-4 h-4" />,
            completed: !!profile.bio && profile.bio.length > 20,
            href: '/profile/edit',
            priority: 3
        },
        {
            id: 'country',
            label: 'Add your country',
            description: 'Share where you\'re from',
            icon: <Globe className="w-4 h-4" />,
            completed: !!profile.countryOfOrigin,
            href: '/profile/edit',
            priority: 4
        },
        {
            id: 'languages',
            label: 'Add languages',
            description: 'Let others know what languages you speak',
            icon: <Globe className="w-4 h-4" />,
            completed: (profile.languages?.length || 0) > 0,
            href: '/profile/edit',
            priority: 5
        },
        {
            id: 'verification',
            label: 'Get verified',
            description: 'Build trust with ID verification',
            icon: <ShieldCheck className="w-4 h-4" />,
            completed: !!profile.isVerified,
            href: '/verify',
            priority: 6
        }
    ], [profile]);

    const completedCount = steps.filter(s => s.completed).length;
    const totalCount = steps.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    const nextStep = steps.filter(s => !s.completed).sort((a, b) => a.priority - b.priority)[0];

    if (variant === 'compact') {
        return (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">Profile Completion</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white">{percentage}%</span>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${percentage === 100 ? 'bg-green-500' : 'bg-zinc-900 dark:bg-white'
                            }`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                {/* Next Step */}
                {nextStep && (
                    <Link
                        href={nextStep.href}
                        className="flex items-center justify-between mt-3 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
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
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Complete Your Profile</h3>
                    <span className={`text-sm font-bold ${percentage === 100 ? 'text-green-600 dark:text-green-400' : 'text-zinc-900 dark:text-white'
                        }`}>
                        {percentage}%
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${percentage === 100 ? 'bg-green-500' : 'bg-zinc-900 dark:bg-white'
                            }`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                    {percentage === 100
                        ? 'Great job! Your profile is complete.'
                        : `${completedCount} of ${totalCount} steps completed`
                    }
                </p>
            </div>

            {/* Steps */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {steps.map((step) => (
                    <Link
                        key={step.id}
                        href={step.href}
                        className={`flex items-center gap-4 px-6 py-4 transition-colors ${step.completed
                                ? 'bg-zinc-50 dark:bg-zinc-800/50'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                    >
                        {/* Status Icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${step.completed
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
                            }`}>
                            {step.completed ? (
                                <CheckCircle2 className="w-5 h-5" />
                            ) : (
                                step.icon
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <p className={`font-medium ${step.completed ? 'text-zinc-500 dark:text-zinc-400 line-through' : 'text-zinc-900 dark:text-white'
                                }`}>
                                {step.label}
                            </p>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                                {step.description}
                            </p>
                        </div>

                        {/* Arrow for incomplete */}
                        {!step.completed && (
                            <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
                        )}
                    </Link>
                ))}
            </div>
        </div>
    );
}
