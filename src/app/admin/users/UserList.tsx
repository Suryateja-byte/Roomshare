'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { toggleUserAdmin, suspendUser } from '@/app/actions/admin';
import UserAvatar from '@/components/UserAvatar';
import {
    Shield,
    ShieldOff,
    Ban,
    CheckCircle,
    Search,
    Loader2,
    Home,
    Calendar,
    Star,
    Mail,
    MoreVertical
} from 'lucide-react';

interface User {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    isVerified: boolean;
    isAdmin: boolean;
    isSuspended: boolean;
    emailVerified: Date | null;
    _count: {
        listings: number;
        bookings: number;
        reviewsWritten: number;
    };
}

interface UserListProps {
    initialUsers: User[];
    totalUsers: number;
    currentUserId: string;
}

export default function UserList({ initialUsers, totalUsers, currentUserId }: UserListProps) {
    const [users, setUsers] = useState(initialUsers);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'verified' | 'admin' | 'suspended'>('all');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const handleToggleAdmin = async (userId: string) => {
        setProcessingId(userId);
        try {
            const result = await toggleUserAdmin(userId);
            if (result.success) {
                setUsers(prev =>
                    prev.map(u =>
                        u.id === userId ? { ...u, isAdmin: result.isAdmin! } : u
                    )
                );
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (error) {
            console.error('Error toggling admin:', error);
        } finally {
            setProcessingId(null);
            setOpenMenuId(null);
        }
    };

    const handleSuspend = async (userId: string, suspend: boolean) => {
        setProcessingId(userId);
        try {
            const result = await suspendUser(userId, suspend);
            if (result.success) {
                setUsers(prev =>
                    prev.map(u =>
                        u.id === userId ? { ...u, isSuspended: suspend } : u
                    )
                );
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (error) {
            console.error('Error suspending user:', error);
        } finally {
            setProcessingId(null);
            setOpenMenuId(null);
        }
    };

    const filteredUsers = users.filter(user => {
        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            if (
                !user.name?.toLowerCase().includes(searchLower) &&
                !user.email?.toLowerCase().includes(searchLower)
            ) {
                return false;
            }
        }

        // Status filter
        if (filter === 'verified') return user.isVerified;
        if (filter === 'admin') return user.isAdmin;
        if (filter === 'suspended') return user.isSuspended;
        return true;
    });

    return (
        <div>
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full pl-10 pr-4 py-2 border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-400/20"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'verified', 'admin', 'suspended'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors capitalize ${
                                filter === f
                                    ? 'bg-zinc-900 text-white'
                                    : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="mb-4 text-sm text-zinc-500">
                Showing {filteredUsers.length} of {totalUsers} users
            </div>

            {/* Users List */}
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
                {filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-zinc-500">
                        No users found matching your criteria
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-100">
                        {filteredUsers.map((user) => (
                            <div
                                key={user.id}
                                className={`p-4 flex items-center justify-between hover:bg-zinc-50 ${
                                    user.isSuspended ? 'bg-red-50' : ''
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <UserAvatar
                                        image={user.image}
                                        name={user.name}
                                        size="md"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-zinc-900">
                                                {user.name || 'Unnamed User'}
                                            </span>
                                            {user.isAdmin && (
                                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                                                    Admin
                                                </span>
                                            )}
                                            {user.isVerified && (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                                    Verified
                                                </span>
                                            )}
                                            {user.isSuspended && (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                                                    Suspended
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-sm text-zinc-500">
                                            <Mail className="w-3 h-3" />
                                            {user.email}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
                                            <span className="flex items-center gap-1">
                                                <Home className="w-3 h-3" />
                                                {user._count.listings} listings
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {user._count.bookings} bookings
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Star className="w-3 h-3" />
                                                {user._count.reviewsWritten} reviews
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Menu */}
                                {user.id !== currentUserId && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                                            className="p-2 hover:bg-zinc-100 rounded-lg"
                                        >
                                            <MoreVertical className="w-5 h-5 text-zinc-400" />
                                        </button>

                                        {openMenuId === user.id && (
                                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-10">
                                                <button
                                                    onClick={() => handleToggleAdmin(user.id)}
                                                    disabled={processingId === user.id}
                                                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {processingId === user.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : user.isAdmin ? (
                                                        <ShieldOff className="w-4 h-4 text-zinc-500" />
                                                    ) : (
                                                        <Shield className="w-4 h-4 text-indigo-500" />
                                                    )}
                                                    {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                                                </button>

                                                <button
                                                    onClick={() => handleSuspend(user.id, !user.isSuspended)}
                                                    disabled={processingId === user.id}
                                                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {processingId === user.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : user.isSuspended ? (
                                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                        <Ban className="w-4 h-4 text-red-500" />
                                                    )}
                                                    {user.isSuspended ? 'Unsuspend User' : 'Suspend User'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
