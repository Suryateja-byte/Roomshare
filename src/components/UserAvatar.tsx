'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface UserAvatarProps {
    image?: string | null;
    name?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    className?: string;
}

const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    '2xl': 'w-40 h-40 text-xl',
};

const sizePx = {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
    '2xl': 160,
};

// Helper to validate if an image URL is valid
function isValidImageUrl(url: string | null | undefined): url is string {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    // Check for valid URL patterns
    return trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('data:image/');
}

export default function UserAvatar({ image, name, size = 'md', className }: UserAvatarProps) {
    const [imageError, setImageError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const sizeClass = sizeClasses[size];

    // Validate image URL
    const hasValidImage = isValidImageUrl(image);

    useEffect(() => {
        setImageError(false);
        setIsLoading(true);
    }, [image]);

    // Render image only if we have a valid URL and no error
    if (hasValidImage && !imageError) {
        return (
            <div className={cn('rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 relative shrink-0', sizeClass.split(' ').slice(0, 2).join(' '), className)}>
                {/* Show fallback while loading to prevent broken image flash */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-200 dark:bg-zinc-700">
                        {name ? (
                            <span className="text-zinc-500 dark:text-zinc-400 font-bold">
                                {name.charAt(0).toUpperCase()}
                            </span>
                        ) : (
                            <User className="w-[60%] h-[60%] text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
                        )}
                    </div>
                )}
                <Image
                    src={image}
                    alt={name || 'User'}
                    fill
                    sizes={`${sizePx[size]}px`}
                    quality={90}
                    className={cn("object-cover transition-opacity duration-200", isLoading ? "opacity-0" : "opacity-100")}
                    onLoad={() => {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('[UserAvatar] Image loaded successfully:', image);
                        }
                        setIsLoading(false);
                    }}
                    onError={() => {
                        console.error('[UserAvatar] Image failed to load:', image);
                        console.error('[UserAvatar] This often means the Supabase bucket is not public. Check Storage → images bucket → Settings → Make public');
                        setImageError(true);
                        setIsLoading(false);
                    }}
                />
            </div>
        );
    }

    // Initials fallback
    if (name) {
        return (
            <div className={cn('rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold shrink-0', sizeClass, className)}>
                {name.charAt(0).toUpperCase()}
            </div>
        );
    }

    // Default SVG fallback
    return (
        <div className={cn('rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 shrink-0', sizeClass, className)}>
            <User className="w-[60%] h-[60%]" strokeWidth={1.5} />
        </div>
    );
}
