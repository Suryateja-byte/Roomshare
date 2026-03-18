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
            <button
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800"
                aria-label="Toggle theme"
            >
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
            <div role="group" aria-label="Theme" className="px-4 py-2">
                <p role="none" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Theme</p>
                <div role="none" className="flex gap-1">
                    <button
                        role="menuitemradio"
                        aria-checked={theme === 'light'}
                        tabIndex={-1}
                        onClick={() => setTheme('light')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
                            theme === 'light'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                        Light
                    </button>
                    <button
                        role="menuitemradio"
                        aria-checked={theme === 'dark'}
                        tabIndex={-1}
                        onClick={() => setTheme('dark')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
                            theme === 'dark'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                        Dark
                    </button>
                    <button
                        role="menuitemradio"
                        aria-checked={theme === 'system'}
                        tabIndex={-1}
                        onClick={() => setTheme('system')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
                            theme === 'system'
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                        Auto
                    </button>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={cycleTheme}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
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
