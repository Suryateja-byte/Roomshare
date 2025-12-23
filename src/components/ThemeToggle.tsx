'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
    variant?: 'button' | 'menu-item';
}

export default function ThemeToggle({ variant = 'button' }: ThemeToggleProps) {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Avoid hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return variant === 'button' ? (
            <button className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <Sun className="w-5 h-5 text-zinc-600" />
            </button>
        ) : null;
    }

    const cycleTheme = () => {
        if (theme === 'system') {
            setTheme('light');
        } else if (theme === 'light') {
            setTheme('dark');
        } else {
            setTheme('system');
        }
    };

    if (variant === 'menu-item') {
        return (
            <div className="px-4 py-2">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Theme</p>
                <div className="flex gap-1">
                    <button
                        onClick={() => setTheme('light')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            theme === 'light'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Sun className="w-3.5 h-3.5" />
                        Light
                    </button>
                    <button
                        onClick={() => setTheme('dark')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            theme === 'dark'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Moon className="w-3.5 h-3.5" />
                        Dark
                    </button>
                    <button
                        onClick={() => setTheme('system')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            theme === 'system'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                        Auto
                    </button>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={cycleTheme}
            className="p-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Toggle theme"
        >
            {resolvedTheme === 'dark' ? (
                <Moon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            ) : (
                <Sun className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            )}
        </button>
    );
}
