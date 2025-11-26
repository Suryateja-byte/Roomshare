import { cn } from '@/lib/utils';

interface UserAvatarProps {
    image?: string | null;
    name?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
};

export default function UserAvatar({ image, name, size = 'md', className }: UserAvatarProps) {
    const sizeClass = sizeClasses[size];

    if (image) {
        return (
            <div className={cn('rounded-full overflow-hidden bg-zinc-200', sizeClass, className)}>
                <img src={image} alt={name || 'User'} className="w-full h-full object-cover" />
            </div>
        );
    }

    // Default SVG avatar
    return (
        <div className={cn('rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400', sizeClass, className)}>
            <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 21V20C4 16.6863 6.68629 14 10 14H14C17.3137 14 20 16.6863 20 20V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}
