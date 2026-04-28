"use client";

import { useState } from "react";

import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  Bell,
  Lock,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
  ShieldOff,
  Ban,
} from "lucide-react";
import {
  NotificationPreferences,
  updateNotificationPreferences,
  changePassword,
  deleteAccount,
} from "@/app/actions/settings";
import { unblockUser } from "@/app/actions/block";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import UserAvatar from "@/components/UserAvatar";
import { PasswordConfirmationModal } from "@/components/auth/PasswordConfirmationModal";
import { Button } from "@/components/ui/button";

interface BlockedUserInfo {
  id: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
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
  blockedUsers: initialBlockedUsers = [],
}: SettingsClientProps) {
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Blocked users state
  const [blockedUsers, setBlockedUsers] =
    useState<BlockedUserInfo[]>(initialBlockedUsers);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaveSuccess(false);
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    const result = await updateNotificationPreferences(preferences);
    setSaving(false);
    if (result.success) {
      setSaveSuccess(true);
      toast.success("Preferences saved");
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      toast.error("Failed to save preferences");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError("Password must be at least 12 characters");
      return;
    }

    setChangingPassword(true);
    const result = await changePassword(currentPassword, newPassword);
    setChangingPassword(false);

    if (result.success) {
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } else {
      setPasswordError(result.error || "Failed to change password");
    }
  };

  const handleDeleteClick = () => {
    if (deleteConfirmText !== "DELETE") return;
    // Show password confirmation modal before deletion
    setShowPasswordModal(true);
  };

  const handleDeleteAccount = async (password?: string) => {
    setDeleting(true);
    const result = await deleteAccount(password);

    if (result.success) {
      await signOut({ callbackUrl: "/" });
    } else {
      // P0-5 FIX: Handle stale session for OAuth accounts
      if ("code" in result && result.code === "SESSION_FRESHNESS_REQUIRED") {
        toast.error("Please sign in again to confirm account deletion.");
        await signOut({ callbackUrl: "/login?callbackUrl=/settings" });
        return;
      }
      setDeleting(false);
      setShowPasswordModal(false);
      toast.error(result.error || "Failed to delete account");
    }
  };

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      const result = await unblockUser(userId);
      if (result.success) {
        setBlockedUsers((prev) => prev.filter((b) => b.user.id !== userId));
      }
    } catch (error) {
      console.error("Failed to unblock user:", error);
    } finally {
      setUnblockingId(null);
    }
  };

  const notificationOptions = [
    {
      key: "emailBookingRequests" as const,
      label: "Booking Requests",
      description: "When someone requests to book your listing",
    },
    {
      key: "emailBookingUpdates" as const,
      label: "Booking Updates",
      description: "When your booking is accepted, rejected, or cancelled",
    },
    {
      key: "emailMessages" as const,
      label: "New Messages",
      description: "When you receive a new message",
    },
    {
      key: "emailReviews" as const,
      label: "Reviews",
      description: "When someone leaves you a review",
    },
    {
      key: "emailSearchAlerts" as const,
      label: "Search Alerts",
      description: "When new listings match your saved searches",
    },
    {
      key: "emailMarketing" as const,
      label: "Marketing",
      description: "Tips, updates, and promotional content",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Notification Preferences */}
      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="p-6 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-on-surface">
                Email Notifications
              </h2>
              <p className="text-sm text-on-surface-variant">
                Choose what emails you want to receive
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {notificationOptions.map((option) => (
            <div
              key={option.key}
              className="p-4 flex items-center justify-between hover:bg-surface-container-high"
            >
              <div>
                <p className="font-medium text-on-surface">{option.label}</p>
                <p className="text-sm text-on-surface-variant">
                  {option.description}
                </p>
              </div>
              <button
                onClick={() => handleToggle(option.key)}
                role="switch"
                aria-checked={preferences[option.key]}
                aria-label={`Toggle ${option.label}`}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  preferences[option.key]
                    ? "bg-primary"
                    : "bg-surface-container-high"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    preferences[option.key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
        <div className="p-4 bg-surface-canvas pt-6">
          <Button onClick={handleSavePreferences} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4" />
            ) : null}
            {saveSuccess ? "Saved!" : "Save Preferences"}
          </Button>
        </div>
      </section>

      {/* Change Password */}
      {hasPassword && (
        <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
          <div className="p-6 pb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-on-surface">
                  Change Password
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Update your account password
                </p>
              </div>
            </div>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-on-surface-variant mb-1"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-outline-variant/20 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-on-surface-variant mb-1"
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-outline-variant/20 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
                minLength={12}
              />
              <PasswordStrengthMeter password={newPassword} className="mt-2" />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-on-surface-variant mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-outline-variant/20 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600">
                Password changed successfully!
              </p>
            )}
            <Button type="submit" variant="warning" disabled={changingPassword}>
              {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </section>
      )}

      {/* Blocked Users */}
      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="p-6 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface-container-high rounded-lg">
              <Ban className="w-5 h-5 text-on-surface-variant" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-on-surface">
                Blocked Users
              </h2>
              <p className="text-sm text-on-surface-variant">
                Manage users you have blocked
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {blockedUsers.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-4">
              You haven&apos;t blocked anyone
            </p>
          ) : (
            <ul className="space-y-2">
              {blockedUsers.map((blocked) => (
                <li
                  key={blocked.id}
                  className="py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      image={blocked.user.image}
                      name={blocked.user.name}
                      size="md"
                    />
                    <div>
                      <p className="font-medium text-on-surface">
                        {blocked.user.name || "Unknown User"}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        Blocked{" "}
                        {new Date(blocked.blockedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnblock(blocked.user.id)}
                    disabled={unblockingId === blocked.user.id}
                  >
                    {unblockingId === blocked.user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldOff className="w-4 h-4" />
                    )}
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Delete Account */}
      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant/20 overflow-hidden">
        <div className="p-6 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-on-surface">
                Delete Account
              </h2>
              <p className="text-sm text-on-surface-variant">
                Delete your account and remove personal access
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {!showDeleteConfirm ? (
            <div>
              <p className="text-sm text-on-surface-variant mb-4">
                Once you delete your account, there is no going back. Your
                sign-in access and personal profile data will be removed; safety,
                fraud, and legal records may be retained when required.
              </p>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete My Account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">
                    This action cannot be undone
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    This will delete your account ({userEmail}) and remove
                    personal access. Some safety, fraud, and legal records may be
                    retained when required.
                  </p>
                </div>
              </div>
              <div>
                <label
                  htmlFor="deleteConfirmText"
                  className="block text-sm font-medium text-on-surface-variant mb-1"
                >
                  Type DELETE to confirm
                </label>
                <input
                  id="deleteConfirmText"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant/20 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="DELETE"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Forever
                </Button>
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
        description="This action will delete your account and remove personal access. Safety, fraud, and legal records may be retained when required. This cannot be undone."
        confirmText="Delete My Account"
        confirmVariant="destructive"
        hasPassword={hasPassword}
        isLoading={deleting}
      />
    </div>
  );
}
