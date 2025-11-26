'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { Plus, MessageSquare, Menu, X, Search, User, LogOut, Settings, Calendar, Bell, Heart, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import NotificationCenter from '@/components/NotificationCenter';
import SearchForm from '@/components/SearchForm';

// --- Inline UserMenu Component ---
const UserMenu = ({ user }: { user: any }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="rounded-full border border-zinc-200 hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
                <UserAvatar image={user.image} name={user.name} size="sm" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-xl shadow-zinc-900/10 border border-zinc-100 py-2 animate-in fade-in zoom-in-95 duration-200 origin-top-right z-[1100]">
                    <div className="px-4 py-2 border-b border-zinc-50 mb-1">
                        <p className="text-sm font-semibold text-zinc-900">{user.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                    </div>
                    <a href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
                        <User className="w-4 h-4" /> Profile
                    </a>
                    <a href="/bookings" className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
                        <Calendar className="w-4 h-4" /> Bookings
                    </a>
                    <a href="/saved" className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
                        <Heart className="w-4 h-4" /> Saved Listings
                    </a>
                    <a href="/recently-viewed" className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
                        <Clock className="w-4 h-4" /> Recently Viewed
                    </a>
                    <a href="/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
                        <Settings className="w-4 h-4" /> Settings
                    </a>
                    <div className="h-px bg-zinc-50 my-1"></div>
                    <button
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                        onClick={() => signOut()}
                    >
                        <LogOut className="w-4 h-4" /> Log out
                    </button>
                </div>
            )}
        </div>
    );
};

// --- Main Navbar Component ---

interface NavbarClientProps {
    user: any;
    unreadCount?: number;
}

export default function NavbarClient({ user, unreadCount = 0 }: NavbarClientProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentUnreadCount, setCurrentUnreadCount] = useState(unreadCount);
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

    // Add scroll listener to change navbar appearance
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

    const isSearchPage = pathname === '/search';

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 border-b ${isScrolled
                ? 'bg-white/80 backdrop-blur-xl border-zinc-200/50 py-3 shadow-sm'
                : 'bg-white/0 border-transparent py-5'
                }`}
        >
            <div className="container mx-auto px-6 flex items-center justify-between h-16 gap-4">

                {/* Logo - Text Based, Minimal */}
                <a href="/" className="flex items-center gap-2 group shrink-0">
                    <span className="font-semibold text-xl tracking-tighter text-zinc-900">
                        RoomShare<span className="text-zinc-400">.</span>
                    </span>
                </a>

                {/* Search Bar (Desktop) - Hidden on Home Page */}
                {!isSearchPage && pathname !== '/' && (
                    <div className="hidden md:block flex-1 max-w-2xl mx-4">
                        <SearchForm variant="compact" />
                    </div>
                )}

                {/* Desktop Center Links - Show on lg screens if search bar is present, or md if not */}
                <div className={`hidden ${(!isSearchPage && pathname !== '/') ? 'lg:flex' : 'md:flex'} items-center gap-8`}>
                    <a
                        href="/search"
                        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        Find a Room
                    </a>
                    <a
                        href="/listings/create"
                        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                    >
                        List a Room
                    </a>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3 md:gap-4 shrink-0">
                    {/* Search Icon (Mobile Only) */}
                    <a
                        href="/search"
                        className="md:hidden p-2 text-zinc-600 hover:text-zinc-900 transition-colors rounded-full hover:bg-zinc-100"
                        aria-label="Search for rooms"
                    >
                        <Search className="w-5 h-5" />
                    </a>

                    {user ? (
                        <>
                            {/* Notification Center */}
                            <div className="hidden md:block">
                                <NotificationCenter />
                            </div>

                            <a
                                href="/messages"
                                className="hidden md:flex p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-all relative"
                                aria-label={currentUnreadCount > 0 ? `Messages, ${currentUnreadCount} unread` : 'Messages'}
                            >
                                <MessageSquare className="w-5 h-5" />
                                {currentUnreadCount > 0 && (
                                    <span
                                        className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1"
                                        aria-hidden="true"
                                    >
                                        {currentUnreadCount > 9 ? '9+' : currentUnreadCount}
                                    </span>
                                )}
                            </a>
                            <UserMenu user={user} />
                        </>
                    ) : (
                        <div className="hidden md:flex items-center gap-4">
                            <a
                                href="/login"
                                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                            >
                                Log in
                            </a>
                            <a href="/signup">
                                <Button className="rounded-full bg-zinc-900 text-white hover:bg-zinc-800 h-9 px-5 text-sm font-medium shadow-lg shadow-zinc-900/10">
                                    Sign up
                                </Button>
                            </a>
                        </div>
                    )}

                    {/* Post Ad Button (Desktop) */}
                    <a href="/listings/create" className="hidden md:block">
                        <Button variant="outline" className="rounded-full border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 text-zinc-900 h-9 px-4 text-sm font-medium transition-all">
                            <Plus className="w-4 h-4 mr-2" />
                            Post Ad
                        </Button>
                    </a>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden p-2 z-50 relative rounded-lg hover:bg-zinc-100 transition-colors touch-target"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={isMobileMenuOpen}
                        aria-controls="mobile-menu"
                    >
                        {isMobileMenuOpen ? (
                            <X className="w-6 h-6 text-zinc-900" />
                        ) : (
                            <Menu className="w-6 h-6 text-zinc-900" />
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    id="mobile-menu"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Navigation menu"
                    className="fixed inset-0 bg-white z-[999] flex flex-col justify-center items-center gap-6 sm:gap-8 animate-in fade-in slide-in-from-bottom-5 duration-300 px-6"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setIsMobileMenuOpen(false);
                        }
                    }}
                >
                    <a
                        href="/search"
                        className="text-2xl sm:text-3xl font-light text-zinc-900 tracking-tight py-2 hover:text-indigo-600 transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        Find a Room
                    </a>
                    <a
                        href="/listings/create"
                        className="text-2xl sm:text-3xl font-light text-zinc-900 tracking-tight py-2 hover:text-indigo-600 transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        List a Room
                    </a>

                    <div className="w-12 h-[1px] bg-zinc-200 my-2" aria-hidden="true"></div>

                    {!user ? (
                        <>
                            <a
                                href="/login"
                                className="text-lg sm:text-xl font-medium text-zinc-500 py-2 hover:text-zinc-900 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Log in
                            </a>
                            <a
                                href="/signup"
                                className="text-lg sm:text-xl font-medium text-zinc-900 dark:text-zinc-100 py-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Sign up
                            </a>
                        </>
                    ) : (
                        <>
                            <a
                                href="/profile"
                                className="text-lg sm:text-xl font-medium text-zinc-900 dark:text-zinc-100 py-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Profile
                            </a>
                            <a
                                href="/bookings"
                                className="text-lg sm:text-xl font-medium text-zinc-500 dark:text-zinc-400 py-2 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Bookings
                            </a>
                            <a
                                href="/notifications"
                                className="text-lg sm:text-xl font-medium text-zinc-500 dark:text-zinc-400 py-2 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Notifications
                            </a>
                            <a
                                href="/messages"
                                className="text-lg sm:text-xl font-medium text-zinc-500 dark:text-zinc-400 py-2 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Messages
                            </a>
                        </>
                    )}


                </div>
            )}
        </nav>
    );
}
