'use client';

import { User } from 'next-auth';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useState } from 'react';

interface UserMenuProps {
    user: User;
}

export default function UserMenu({ user }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 p-1 pr-3 rounded-full border border-border hover:bg-accent transition-colors"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-medium hidden md:block">{user.name}</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 space-y-1">
                            <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                                {user.email}
                            </div>
                            <Link
                                href="/profile"
                                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <UserIcon className="w-4 h-4" />
                                Profile
                            </Link>
                            <button
                                onClick={() => signOut()}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign out
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
