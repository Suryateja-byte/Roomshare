'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Bell, Lock, Trash2, Loader2, Check, AlertTriangle, ShieldOff, Ban } from 'lucide-react';
import {
    NotificationPreferences,
    updateNotificationPreferences,
    changePassword,
    deleteAccount
} from '@/app/actions/settings';
import { unblockUser } from '@/app/actions/block';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import UserAvatar from '@/components/UserAvatar';
import { PasswordConfirmationModal } from '@/components/auth/PasswordConfirmationModal';

interface BlockedUserInfo {
    id: string;
    user: {
        id: string;
        name: string | null;
        image: string | null;
        email: string | null;
    };
    blockedAt: Date;
}

interface SettingsClientProps {
    initialPreferences: NotificationPreferences;
    hasPassword: boolean;
    userEmail: string;
    blockedUsers?: BlockedUserInfo[];
}

export default function SettingsClient({
    initialPreferences,
    hasPassword,
    userEmail,
    blockedUsers: initialBlockedUsers = []
}: SettingsClientProps) {
    const router = useRouter();
    const [preferences, setPreferences] = useState<NotificationPreferences>(initialPreferences);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Blocked users state
    const [blockedUsers, setBlockedUsers] = useState<BlockedUserInfo[]>(initialBlockedUsers);
    const [unblockingId, setUnblockingId] = useState<string | null>(null);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    // Delete account state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const handleToggle = (key: keyof NotificationPreferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
        setSaveSuccess(false);
    };

    const handleSavePreferences = async () => {
        setSaving(true);
        const result = await updateNotificationPreferences(preferences);
        setSaving(false);
        if (result.success) {
            setSaveSuccess(true);
            toast.success('Preferences saved');
            setTimeout(() => setSaveSuccess(false), 3000);
        } else {
            toast.error('Failed to save preferences');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess(false);

        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }

        if (newPassword.length < 12) {
            setPasswordError('Password must be at least 12 characters');
            return;
        }

        setChangingPassword(true);
        const result = await changePassword(currentPassword, newPassword);
        setChangingPassword(false);

        if (result.success) {
            setPasswordSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setPasswordSuccess(false), 3000);
        } else {
            setPasswordError(result.error || 'Failed to change password');
        }
    };

    const handleDeleteClick = () => {
        if (deleteConfirmText !== 'DELETE') return;
        // Show password confirmation modal before deletion
        setShowPasswordModal(true);
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        const result = await deleteAccount();

        if (result.success) {
            await signOut({ callbackUrl: '/' });
        } else {
            setDeleting(false);
            setShowPasswordModal(false);
            toast.error(result.error || 'Failed to delete account');
        }
    };

    const handleUnblock = async (userId: string) => {
        setUnblockingId(userId);
        try {
            const result = await unblockUser(userId);
            if (result.success) {
                setBlockedUsers(prev => prev.filter(b => b.user.id !== userId));
            }
        } catch (error) {
            console.error('Failed to unblock user:', error);
        } finally {
            setUnblockingId(null);
        }
    };

    const notificationOptions = [
        { key: 'emailBookingRequests' as const, label: 'Booking Requests', description: 'When someone requests to book your listing' },
        { key: 'emailBookingUpdates' as const, label: 'Booking Updates', description: 'When your booking is accepted, rejected, or cancelled' },
        { key: 'emailMessages' as const, label: 'New Messages', description: 'When you receive a new message' },
        { key: 'emailReviews' as const, label: 'Reviews', description: 'When someone leaves you a review' },
        { key: 'emailSearchAlerts' as const, label: 'Search Alerts', description: 'When new listings match your saved searches' },
        { key: 'emailMarketing' as const, label: 'Marketing', description: 'Tips, updates, and promotional content' },
    ];

    return (
        <div className="space-y-8">
            {/* Notification Preferences */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                            <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Email Notifications</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose what emails you want to receive</p>
                        </div>
                    </div>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {notificationOptions.map(option => (
                        <div key={option.key} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800">
                            <div>
                                <p className="font-medium text-zinc-900 dark:text-white">{option.label}</p>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">{option.description}</p>
                            </div>
                            <button
                                onClick={() => handleToggle(option.key)}
                                role="switch"
                                aria-checked={preferences[option.key]}
                                aria-label={`Toggle ${option.label}`}
                                className={`relative w-11 h-6 rounded-full transition-colors ${preferences[option.key] ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600'
                                    }`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${preferences[option.key] ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={handleSavePreferences}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saveSuccess ? (
                            <Check className="w-4 h-4" />
                        ) : null}
                        {saveSuccess ? 'Saved!' : 'Save Preferences'}
                    </button>
                </div>
            </section>

            {/* Change Password */}
            {hasPassword && (
                <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Change Password</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Update your account password</p>
                            </div>
                        </div>
                    </div>
                    <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Current Password
                            </label>
                            <input
                                id="currentPassword"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-400/20 focus:border-zinc-400"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                New Password
                            </label>
                            <input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-400/20 focus:border-zinc-400"
                                required
                                minLength={6}
                            />
                            <PasswordStrengthMeter password={newPassword} className="mt-2" />
                        </div>
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Confirm New Password
                            </label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-400/20 focus:border-zinc-400"
                                required
                            />
                        </div>
                        {passwordError && (
                            <p className="text-sm text-red-600">{passwordError}</p>
                        )}
                        {passwordSuccess && (
                            <p className="text-sm text-green-600">Password changed successfully!</p>
                        )}
                        <button
                            type="submit"
                            disabled={changingPassword}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors"
                        >
                            {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                            Change Password
                        </button>
                    </form>
                </section>
            )}

            {/* Blocked Users */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                            <Ban className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Blocked Users</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage users you have blocked</p>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    {blockedUsers.length === 0 ? (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
                            You haven't blocked anyone
                        </p>
                    ) : (
                        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {blockedUsers.map((blocked) => (
                                <li key={blocked.id} className="py-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <UserAvatar image={blocked.user.image} name={blocked.user.name} size="md" />
                                        <div>
                                            <p className="font-medium text-zinc-900 dark:text-white">
                                                {blocked.user.name || 'Unknown User'}
                                            </p>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                Blocked {new Date(blocked.blockedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleUnblock(blocked.user.id)}
                                        disabled={unblockingId === blocked.user.id}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-60"
                                    >
                                        {unblockingId === blocked.user.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <ShieldOff className="w-4 h-4" />
                                        )}
                                        Unblock
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {/* Delete Account */}
            <section className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
                <div className="p-6 border-b border-red-100 dark:border-red-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg">
                            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Delete Account</h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Permanently delete your account and all data</p>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    {!showDeleteConfirm ? (
                        <div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                                Once you delete your account, there is no going back. All your listings,
                                messages, bookings, and reviews will be permanently removed.
                            </p>
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Delete My Account
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-red-900 dark:text-red-400">This action cannot be undone</p>
                                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                                        This will permanently delete your account ({userEmail}) and all associated data.
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="deleteConfirmText" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Type DELETE to confirm
                                </label>
                                <input
                                    id="deleteConfirmText"
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                    placeholder="DELETE"
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteConfirmText('');
                                    }}
                                    className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteClick}
                                    disabled={deleteConfirmText !== 'DELETE' || deleting}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Delete Forever
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Password Confirmation Modal for Account Deletion */}
            <PasswordConfirmationModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                onConfirm={handleDeleteAccount}
                title="Delete Account"
                description="This action will permanently delete your account and all associated data. This cannot be undone."
                confirmText="Delete My Account"
                confirmVariant="destructive"
                hasPassword={hasPassword}
                isLoading={deleting}
            />
        </div>
    );
}
