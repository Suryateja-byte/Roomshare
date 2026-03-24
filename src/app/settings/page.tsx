import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";
import { getUserSettings } from "@/app/actions/settings";
import { getBlockedUsers } from "@/app/actions/block";
import SettingsClient from "./SettingsClient";

export const metadata = {
  title: "Settings | RoomShare",
  description: "Manage your account settings and preferences",
};

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/settings");
  }

  const [settings, blockedUsers] = await Promise.all([
    getUserSettings(),
    getBlockedUsers(),
  ]);

  if (!settings) {
    redirect("/login?callbackUrl=/settings");
  }

  return (
    <div className="min-h-screen bg-surface-canvas">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Profile
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Settings className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-on-surface">
                Settings
              </h1>
              <p className="text-on-surface-variant">
                Manage your account preferences
              </p>
            </div>
          </div>
        </div>

        {/* Settings Content */}
        <SettingsClient
          initialPreferences={settings.notificationPreferences}
          hasPassword={settings.hasPassword}
          userEmail={settings.email || ""}
          blockedUsers={blockedUsers}
        />
      </div>
    </div>
  );
}
