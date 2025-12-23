'use client';

import { useState } from 'react';
import { Loader2, Lock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { verifyPassword } from '@/app/actions/settings';

interface PasswordConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description: string;
    confirmText?: string;
    confirmVariant?: 'primary' | 'destructive';
    hasPassword: boolean;
    isLoading?: boolean;
}

export function PasswordConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    confirmVariant = 'destructive',
    hasPassword,
    isLoading: externalLoading = false,
}: PasswordConfirmationModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    // Reset state and call onClose
    const handleClose = () => {
        setPassword('');
        setError('');
        setIsVerifying(false);
        onClose();
    };

    const handleConfirm = async () => {
        setError('');

        // If user has a password, verify it first
        if (hasPassword) {
            if (!password.trim()) {
                setError('Please enter your password');
                return;
            }

            setIsVerifying(true);
            const result = await verifyPassword(password);
            setIsVerifying(false);

            if (!result.success) {
                setError(result.error || 'Password verification failed');
                return;
            }
        }

        // Password verified (or not required), proceed with action
        await onConfirm();
    };

    const isLoading = isVerifying || externalLoading;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <DialogTitle className="text-xl">{title}</DialogTitle>
                    </div>
                    <DialogDescription className="pt-2">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {hasPassword ? (
                        <>
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    For your security, please enter your password to confirm this action.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="confirm-password"
                                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                                >
                                    Password
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-4 w-4 text-zinc-400" />
                                    </div>
                                    <input
                                        id="confirm-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            setError('');
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !isLoading) {
                                                handleConfirm();
                                            }
                                        }}
                                        placeholder="Enter your password"
                                        className="block w-full pl-10 pr-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent text-sm"
                                        autoComplete="current-password"
                                        disabled={isLoading}
                                    />
                                </div>
                                {error && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        {error}
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                You signed in with Google, so no password is required. Click confirm to proceed.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant={confirmVariant}
                        onClick={handleConfirm}
                        disabled={isLoading || (hasPassword && !password.trim())}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            confirmText
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default PasswordConfirmationModal;
