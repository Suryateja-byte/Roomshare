import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { getUserSettings } from '@/app/actions/settings';
import { getBlockedUsers } from '@/app/actions/block';
import SettingsClient from './SettingsClient';

export const metadata = {
    title: 'Settings | RoomShare',
    description: 'Manage your account settings and preferences',
};

export default async function SettingsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/settings');
    }

    const [settings, blockedUsers] = await Promise.all([
        getUserSettings(),
        getBlockedUsers()
    ]);

    if (!settings) {
        redirect('/login?callbackUrl=/settings');
    }

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/profile"
                        className="inline-flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Profile
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-100 rounded-xl">
                            <Settings className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
                            <p className="text-zinc-500">Manage your account preferences</p>
                        </div>
                    </div>
                </div>

                {/* Settings Content */}
                <SettingsClient
                    initialPreferences={settings.notificationPreferences}
                    hasPassword={settings.hasPassword}
                    userEmail={settings.email || ''}
                    blockedUsers={blockedUsers}
                />
            </div>
        </div>
    );
}
