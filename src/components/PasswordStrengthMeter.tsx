'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
    password: string;
    className?: string;
}

interface StrengthCheck {
    label: string;
    passed: boolean;
}

type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

const strengthConfig: Record<StrengthLevel, { label: string; color: string; bgColor: string }> = {
    weak: {
        label: 'Weak',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-500',
    },
    fair: {
        label: 'Fair',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500',
    },
    good: {
        label: 'Good',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-500',
    },
    strong: {
        label: 'Strong',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-500',
    },
};

export function calculatePasswordStrength(password: string): {
    level: StrengthLevel;
    score: number;
    checks: StrengthCheck[];
} {
    const checks: StrengthCheck[] = [
        { label: 'At least 12 characters', passed: password.length >= 12 },
        { label: 'Contains lowercase letter', passed: /[a-z]/.test(password) },
        { label: 'Contains uppercase letter', passed: /[A-Z]/.test(password) },
        { label: 'Contains a number', passed: /[0-9]/.test(password) },
        { label: 'Contains special character', passed: /[^a-zA-Z0-9]/.test(password) },
    ];

    const passedChecks = checks.filter((c) => c.passed).length;

    let level: StrengthLevel;
    if (passedChecks <= 1) {
        level = 'weak';
    } else if (passedChecks === 2) {
        level = 'fair';
    } else if (passedChecks === 3 || passedChecks === 4) {
        level = 'good';
    } else {
        level = 'strong';
    }

    return { level, score: passedChecks, checks };
}

export default function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
    const { level, score, checks } = useMemo(() => calculatePasswordStrength(password), [password]);
    const config = strengthConfig[level];

    if (!password) {
        return null;
    }

    const percentage = (score / checks.length) * 100;

    return (
        <div className={cn('space-y-2', className)}>
            {/* Strength Bar */}
            <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Password strength</span>
                    <span className={cn('font-medium', config.color)}>{config.label}</span>
                </div>
                <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                        className={cn('h-full rounded-full transition-all duration-300', config.bgColor)}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* Requirements Checklist */}
            <div className="grid grid-cols-1 gap-1">
                {checks.map((check, i) => (
                    <div
                        key={i}
                        className={cn(
                            'flex items-center gap-1.5 text-xs transition-colors',
                            check.passed
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-zinc-400 dark:text-zinc-500'
                        )}
                    >
                        {check.passed ? (
                            <Check className="w-3 h-3" />
                        ) : (
                            <X className="w-3 h-3" />
                        )}
                        <span>{check.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
