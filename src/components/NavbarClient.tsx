'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Link from 'next/link';

import {
    Plus,
    MessageSquare,
    Menu,
    X,
    Search,
    User,
    LogOut,
    Settings,
    Calendar,
    Heart,
    Clock,
    ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import NotificationCenter from '@/components/NotificationCenter';
import ThemeToggle from '@/components/ThemeToggle';

// --- Helper Components ---

const IconButton = ({
    icon,
    count,
    onClick,
    href,
    ariaLabel
}: {
    icon: React.ReactNode;
    count?: number;
    onClick?: () => void;
    href?: string;
    ariaLabel?: string;
}) => {
    const buttonContent = (
        <>
            {icon}
            {count !== undefined && count > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span>
                </span>
            )}
        </>
    );

    const className = "p-2.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 rounded-full transition-all relative";

    if (href) {
        return (
            <a href={href} className={className} aria-label={ariaLabel}>
                {buttonContent}
            </a>
        );
    }

    return (
        <button onClick={onClick} className={className} aria-label={ariaLabel}>
            {buttonContent}
        </button>
    );
};

const MenuItem = ({
    icon,
    text,
    badge,
    danger,
    onClick,
    href
}: {
    icon: React.ReactNode;
    text: string;
    badge?: string;
    danger?: boolean;
    onClick?: () => void;
    href?: string;
}) => {
    const className = `w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        danger
            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
    }`;

    const content = (
        <>
            <div className="flex items-center gap-3">
                <span className={danger ? 'text-red-500' : 'text-zinc-400 dark:text-zinc-500'}>{icon}</span>
                {text}
            </div>
            {badge && (
                <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md text-xs font-bold">
                    {badge}
                </span>
            )}
        </>
    );

    if (href) {
        return (
            <a href={href} className={className}>
                {content}
            </a>
        );
    }

    return (
        <button onClick={onClick} className={className}>
            {content}
        </button>
    );
};

// --- Main Navbar Component ---

interface NavbarClientProps {
    user: any;
    unreadCount?: number;
}

export default function NavbarClient({ user, unreadCount = 0 }: NavbarClientProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentUnreadCount, setCurrentUnreadCount] = useState(unreadCount);
    const profileRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    // Fetch unread count from API
    const fetchUnreadCount = async () => {
        if (!user) return;
        try {
            const response = await fetch('/api/messages/unread');
            if (response.ok) {
                const data = await response.json();
                setCurrentUnreadCount(data.count);
            }
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    // Handle scroll effect for glassmorphism
    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle body scroll locking for mobile menu
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileMenuOpen]);

    // Poll for unread count updates and listen for custom events
    useEffect(() => {
        if (!user) return;

        // Fetch immediately on mount
        fetchUnreadCount();

        // Poll every 30 seconds
        const interval = setInterval(fetchUnreadCount, 30000);

        // Listen for custom event from messages page
        const handleMessagesRead = () => {
            fetchUnreadCount();
        };
        window.addEventListener('messagesRead', handleMessagesRead);

        return () => {
            clearInterval(interval);
            window.removeEventListener('messagesRead', handleMessagesRead);
        };
    }, [user]);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 ease-in-out border-b ${
                isScrolled
                    ? 'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-zinc-200 dark:border-zinc-800 py-3 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 border-transparent py-4'
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-12">

                    {/* --- LEFT: Logo --- */}
                    <a href="/" className="flex items-center gap-1 cursor-pointer group flex-shrink-0">
                        <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white font-bold text-lg group-hover:rotate-3 transition-transform shadow-lg shadow-zinc-900/20">
                            R
                        </div>
                        <span className="text-xl font-bold tracking-tight text-zinc-900 hidden sm:block">
                            RoomShare<span className="text-indigo-600">.</span>
                        </span>
                    </a>

                    {/* --- CENTER: Empty Spacer --- */}
                    <div className="flex-1"></div>

                    {/* --- RIGHT: All Actions --- */}
                    <div className="hidden md:flex items-center gap-4 flex-shrink-0">

                        {/* Navigation Link */}
                        <a
                            href="/search"
                            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors mr-2"
                        >
                            Find a Room
                        </a>

                        {/* Icons Section */}
                        <div className="flex items-center gap-1 border-l border-zinc-200 pl-4">
                            <NotificationCenter />
                            <IconButton
                                icon={<MessageSquare size={20} />}
                                count={currentUnreadCount}
                                href="/messages"
                                ariaLabel={currentUnreadCount > 0 ? `Messages, ${currentUnreadCount} unread` : 'Messages'}
                            />
                        </div>

                        {/* CTA Button */}
                        <a href="/listings/create">
                            <Button className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-full font-medium transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-zinc-900/20 h-auto">
                                <Plus size={18} />
                                <span>List a Room</span>
                            </Button>
                        </a>

                        {/* Profile Dropdown / Auth Buttons */}
                        {user ? (
                            <div className="relative" ref={profileRef}>
                                <button
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                    className={`flex items-center gap-2 p-1 pl-2 pr-1 rounded-full border transition-all ${
                                        isProfileOpen
                                            ? 'border-indigo-500 ring-2 ring-indigo-100'
                                            : 'border-zinc-200 hover:border-zinc-300'
                                    }`}
                                    aria-expanded={isProfileOpen}
                                    aria-haspopup="true"
                                >
                                    {user.image ? (
                                        <img
                                            src={user.image}
                                            alt={user.name || 'User'}
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                                            {user.name?.charAt(0) || 'U'}
                                        </div>
                                    )}
                                    <ChevronDown
                                        size={14}
                                        className={`text-zinc-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {/* Dropdown Menu */}
                                {isProfileOpen && (
                                    <div className="absolute right-0 mt-3 w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden origin-top-right animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5 z-[1100]">
                                        <div className="p-5 border-b border-zinc-50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                                            <p className="font-semibold text-zinc-900 dark:text-white">{user.name}</p>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            <MenuItem icon={<User size={18} />} text="Profile" href="/profile" />
                                            <MenuItem icon={<Calendar size={18} />} text="Bookings" href="/bookings" />
                                            <MenuItem icon={<Heart size={18} />} text="Saved Listings" href="/saved" />
                                            <MenuItem icon={<Clock size={18} />} text="Recently Viewed" href="/recently-viewed" />
                                            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2"></div>
                                            <MenuItem icon={<Settings size={18} />} text="Settings" href="/settings" />
                                            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2"></div>
                                            <ThemeToggle variant="menu-item" />
                                            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2"></div>
                                            <MenuItem
                                                icon={<LogOut size={18} />}
                                                text="Log out"
                                                danger
                                                onClick={() => {
                                                    signOut();
                                                    setIsProfileOpen(false);
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 ml-2">
                                <a
                                    href="/login"
                                    className="text-zinc-600 font-medium hover:text-zinc-900 px-3 py-2 transition-colors"
                                >
                                    Log in
                                </a>
                                <a href="/signup">
                                    <Button className="bg-zinc-100 text-zinc-900 font-medium px-4 py-2 rounded-full hover:bg-zinc-200">
                                        Sign up
                                    </Button>
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Toggle */}
                    <div className="md:hidden flex items-center gap-4">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="text-zinc-900 p-2"
                            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={isMobileMenuOpen}
                        >
                            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div
                    className="md:hidden bg-white border-t border-zinc-100 absolute w-full shadow-lg h-screen animate-in slide-in-from-top-5"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Navigation menu"
                >
                    <div className="p-4 space-y-4">
                        {user ? (
                            <div className="flex items-center gap-3 pb-4 border-b border-zinc-100">
                                {user.image ? (
                                    <img
                                        src={user.image}
                                        alt={user.name || 'User'}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                        {user.name?.charAt(0) || 'U'}
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-zinc-900">{user.name}</p>
                                    <a href="/profile" className="text-xs text-zinc-500 hover:text-zinc-700">
                                        View Profile
                                    </a>
                                </div>
                            </div>
                        ) : null}

                        <a
                            href="/search"
                            className="flex items-center gap-3 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-50 rounded-lg px-2"
                            onClick={() => setIsMobileMenuOpen(false)}
                        >
                            <Search size={20} className="text-zinc-400"/> Find a Room
                        </a>

                        {user && (
                            <>
                                <a
                                    href="/messages"
                                    className="flex items-center gap-3 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-50 rounded-lg px-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <MessageSquare size={20} className="text-zinc-400"/>
                                    Messages
                                    {currentUnreadCount > 0 && (
                                        <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                            {currentUnreadCount > 9 ? '9+' : currentUnreadCount}
                                        </span>
                                    )}
                                </a>
                                <a
                                    href="/bookings"
                                    className="flex items-center gap-3 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-50 rounded-lg px-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Calendar size={20} className="text-zinc-400"/> Bookings
                                </a>
                                <a
                                    href="/saved"
                                    className="flex items-center gap-3 py-3 text-lg font-medium text-zinc-900 hover:bg-zinc-50 rounded-lg px-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Heart size={20} className="text-zinc-400"/> Saved Listings
                                </a>
                            </>
                        )}

                        <hr className="border-zinc-100"/>

                        <a href="/listings/create" onClick={() => setIsMobileMenuOpen(false)}>
                            <Button className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-zinc-900/10 h-auto">
                                <Plus size={18} />
                                List a Room
                            </Button>
                        </a>

                        {!user && (
                            <div className="flex flex-col gap-2 pt-2">
                                <a
                                    href="/login"
                                    className="w-full text-center text-zinc-600 py-3 font-medium hover:text-zinc-900"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    Log In
                                </a>
                                <a
                                    href="/signup"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <Button className="w-full bg-zinc-100 text-zinc-900 py-3 font-medium hover:bg-zinc-200 rounded-xl h-auto">
                                        Sign Up
                                    </Button>
                                </a>
                            </div>
                        )}

                        {user && (
                            <button
                                onClick={() => {
                                    signOut();
                                    setIsMobileMenuOpen(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 text-red-600 py-3 font-medium hover:bg-red-50 rounded-xl mt-4"
                            >
                                <LogOut size={18} />
                                Log out
                            </button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}
