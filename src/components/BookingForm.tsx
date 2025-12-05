'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { createBooking, BookingResult } from '@/app/actions/booking';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, AlertTriangle, RefreshCw, CheckCircle, XCircle, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

type ListingStatus = 'ACTIVE' | 'PAUSED' | 'RENTED';

type ErrorType = 'validation' | 'server' | 'network' | 'blocked' | 'auth' | null;

interface BookingFormProps {
    listingId: string;
    price: number;
    ownerId: string;
    isOwner: boolean;
    isLoggedIn: boolean;
    status?: ListingStatus;
}

const MIN_BOOKING_DAYS = 30; // Industry standard minimum stay

const availabilityConfig: Record<ListingStatus, { label: string; colorClass: string; dotClass: string; pulse: boolean }> = {
    ACTIVE: {
        label: 'Available now',
        colorClass: 'text-green-600',
        dotClass: 'bg-green-500',
        pulse: true
    },
    PAUSED: {
        label: 'Temporarily unavailable',
        colorClass: 'text-amber-600',
        dotClass: 'bg-amber-500',
        pulse: false
    },
    RENTED: {
        label: 'Currently rented',
        colorClass: 'text-red-600',
        dotClass: 'bg-red-500',
        pulse: false
    }
};

export default function BookingForm({ listingId, price, ownerId, isOwner, isLoggedIn, status = 'ACTIVE' }: BookingFormProps) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [errorType, setErrorType] = useState<ErrorType>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [hasSubmittedSuccessfully, setHasSubmittedSuccessfully] = useState(false);
    const router = useRouter();
    const { isOffline } = useNetworkStatus();

    // Ref to prevent concurrent submissions (debounce protection)
    const isSubmittingRef = useRef(false);
    const lastSubmissionRef = useRef<number>(0);
    const submissionIdRef = useRef<string | null>(null);
    const DEBOUNCE_MS = 1000; // Minimum time between submissions

    // Check for previous successful submission (browser back navigation)
    useEffect(() => {
        const submittedKey = `booking_submitted_${listingId}`;
        const previousSubmission = sessionStorage.getItem(submittedKey);
        if (previousSubmission) {
            setHasSubmittedSuccessfully(true);
            setMessage('You have already submitted a booking request for this listing.');
        }
    }, [listingId]);

    // Warn user when navigating away during active submission
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isLoading) {
                e.preventDefault();
                // Modern browsers require returnValue to be set
                e.returnValue = 'Your booking request is still being processed. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isLoading]);

    // Calculate booking duration and validate client-side
    const bookingInfo = useMemo(() => {
        if (!startDate || !endDate) return null;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const totalPrice = Math.round((price / 30) * diffDays * 100) / 100;
        return { diffDays, totalPrice, isValid: diffDays >= MIN_BOOKING_DAYS && end > start };
    }, [startDate, endDate, price]);

    // Determine error type from error message/code
    const categorizeError = (result: BookingResult): ErrorType => {
        if (result.code === 'SESSION_EXPIRED') return 'auth';
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) return 'validation';

        const errorMsg = result.error?.toLowerCase() || '';
        if (errorMsg.includes('blocked')) return 'blocked';
        if (errorMsg.includes('network') || errorMsg.includes('fetch')) return 'network';
        if (errorMsg.includes('server') || errorMsg.includes('internal') || errorMsg.includes('failed')) return 'server';

        return 'validation'; // Default to validation for user-facing errors
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();

        // Prevent resubmission after successful submit (browser back)
        if (hasSubmittedSuccessfully) {
            setMessage('You have already submitted a booking request. Go to your bookings to see the status.');
            return;
        }

        // Block submission when offline
        if (isOffline) {
            setMessage('You are currently offline. Please check your internet connection.');
            setErrorType('network');
            return;
        }

        // Debounce protection: prevent rapid submissions
        const now = Date.now();
        if (isSubmittingRef.current || (now - lastSubmissionRef.current) < DEBOUNCE_MS) {
            return;
        }

        setFieldErrors({});
        setErrorType(null);

        if (!startDate || !endDate) {
            setMessage('Please select both check-in and check-out dates');
            setErrorType('validation');
            return;
        }

        // Client-side validation
        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
            setFieldErrors({ startDate: 'Start date cannot be in the past' });
            setMessage('Start date cannot be in the past');
            setErrorType('validation');
            return;
        }

        if (end <= start) {
            setFieldErrors({ endDate: 'End date must be after start date' });
            setMessage('End date must be after start date');
            setErrorType('validation');
            return;
        }

        if (bookingInfo && bookingInfo.diffDays < MIN_BOOKING_DAYS) {
            setFieldErrors({ endDate: `Minimum booking is ${MIN_BOOKING_DAYS} days` });
            setMessage(`Minimum booking duration is ${MIN_BOOKING_DAYS} days`);
            setErrorType('validation');
            return;
        }

        // Set submission guards
        isSubmittingRef.current = true;
        lastSubmissionRef.current = now;
        setIsLoading(true);
        setMessage('');
        setErrorType(null);

        try {
            const result: BookingResult = await createBooking(
                listingId,
                new Date(startDate),
                new Date(endDate),
                price
            );

            if (result.success) {
                setMessage('Request sent successfully!');
                setErrorType(null);
                setHasSubmittedSuccessfully(true);
                // Mark as submitted to prevent browser back resubmission
                sessionStorage.setItem(`booking_submitted_${listingId}`, 'true');
                setStartDate('');
                setEndDate('');
                setTimeout(() => {
                    router.push('/bookings');
                }, 1500);
            } else {
                const errType = categorizeError(result);
                setErrorType(errType);

                // Set user-friendly messages based on error type
                if (errType === 'auth') {
                    setMessage('Your session has expired. Please sign in again.');
                } else if (errType === 'server') {
                    setMessage('Something went wrong on our end. Please try again.');
                } else if (errType === 'network') {
                    setMessage('Unable to connect. Please check your internet connection.');
                } else if (errType === 'blocked') {
                    setMessage(result.error || 'Unable to book this listing');
                } else {
                    setMessage(result.error || 'Failed to send request');
                }

                if (result.fieldErrors) {
                    setFieldErrors(result.fieldErrors);
                }
            }
        } catch (error) {
            // Catch unexpected errors (network failures, etc.)
            console.error('Booking submission error:', error);
            setErrorType('server');
            setMessage('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
            // Reset submission guard after a delay to allow retry if needed
            setTimeout(() => {
                isSubmittingRef.current = false;
            }, 2000);
        }
    }, [startDate, endDate, bookingInfo, listingId, price, router]);

    const handleRetry = useCallback(() => {
        // Reset error state and allow immediate retry
        setMessage('');
        setErrorType(null);
        isSubmittingRef.current = false;
        lastSubmissionRef.current = 0;
    }, []);

    if (isOwner) {
        return null; // Or show some owner-specific view
    }

    // Render error banner with retry option for server/network errors
    const renderErrorBanner = () => {
        if (!message || message.includes('success')) return null;

        const isRetryable = errorType === 'server' || errorType === 'network';
        const isAuthError = errorType === 'auth';

        return (
            <div className={`rounded-xl p-4 ${errorType === 'server' || errorType === 'network'
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${errorType === 'server' || errorType === 'network'
                        ? 'bg-amber-100 dark:bg-amber-900/50'
                        : 'bg-red-100 dark:bg-red-900/50'
                        }`}>
                        {errorType === 'server' || errorType === 'network' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${errorType === 'server' || errorType === 'network'
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-red-800 dark:text-red-200'
                            }`}>
                            {message}
                        </p>

                        {/* Retry button for server/network errors */}
                        {isRetryable && (
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-3 h-3" />
                                Try Again
                            </button>
                        )}

                        {/* Sign in link for auth errors */}
                        {isAuthError && (
                            <Link
                                href="/login"
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors"
                            >
                                <LogIn className="w-3 h-3" />
                                Sign In
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Render success message
    const renderSuccessMessage = () => {
        if (!message.includes('success')) return null;

        return (
            <div className="rounded-xl p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                            {message}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                            Redirecting to your bookings...
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-100 dark:border-zinc-800 p-6 sticky top-24">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white">${price}</span>
                    <span className="text-zinc-500 dark:text-zinc-400"> / month</span>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${availabilityConfig[status].colorClass}`}>
                    <div className={`w-2 h-2 rounded-full ${availabilityConfig[status].dotClass} ${availabilityConfig[status].pulse ? 'animate-pulse' : ''}`} />
                    {availabilityConfig[status].label}
                </div>
            </div>

            {/* Offline Banner */}
            {isOffline && (
                <div className="mb-4 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center gap-3">
                    <WifiOff className="w-5 h-5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        You&apos;re offline. Please check your connection to book.
                    </p>
                </div>
            )}

            {status !== 'ACTIVE' && (
                <div className="mb-4 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {status === 'PAUSED'
                            ? 'This listing is temporarily unavailable. Check back later!'
                            : 'This room is currently rented out.'}
                    </p>
                </div>
            )}

            {/* Login Gate for logged-out users */}
            {!isLoggedIn && status === 'ACTIVE' && (
                <div className="mb-4 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border border-primary/20 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                        <LogIn className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">
                        Sign in to book this room
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                        Create an account or sign in to request a booking
                    </p>
                    <Link href="/login">
                        <Button className="w-full h-11 font-semibold">
                            <LogIn className="w-4 h-4 mr-2" />
                            Sign in to continue
                        </Button>
                    </Link>
                </div>
            )}

            <form onSubmit={handleSubmit} className={`space-y-4 ${status !== 'ACTIVE' || !isLoggedIn ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Check-in</label>
                        <DatePicker
                            value={startDate}
                            onChange={(date) => {
                                setStartDate(date);
                                setFieldErrors((prev) => ({ ...prev, startDate: '' }));
                                if (errorType === 'validation') {
                                    setMessage('');
                                    setErrorType(null);
                                }
                            }}
                            placeholder="Start date"
                            minDate={new Date().toISOString().split('T')[0]}
                            className={`p-2 text-sm ${fieldErrors.startDate ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        />
                        {fieldErrors.startDate && (
                            <p className="text-xs text-red-500">{fieldErrors.startDate}</p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase">Check-out</label>
                        <DatePicker
                            value={endDate}
                            onChange={(date) => {
                                setEndDate(date);
                                setFieldErrors((prev) => ({ ...prev, endDate: '' }));
                                if (errorType === 'validation') {
                                    setMessage('');
                                    setErrorType(null);
                                }
                            }}
                            placeholder="End date"
                            minDate={startDate || new Date().toISOString().split('T')[0]}
                            className={`p-2 text-sm ${fieldErrors.endDate ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        />
                        {fieldErrors.endDate && (
                            <p className="text-xs text-red-500">{fieldErrors.endDate}</p>
                        )}
                    </div>
                </div>

                {/* Minimum stay notice */}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                    Minimum stay: {MIN_BOOKING_DAYS} days
                </p>

                {/* Duration indicator */}
                {bookingInfo && (
                    <div className={`text-sm text-center p-2 rounded-lg ${bookingInfo.isValid
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        }`}>
                        {bookingInfo.diffDays} days selected
                        {!bookingInfo.isValid && bookingInfo.diffDays > 0 && bookingInfo.diffDays < MIN_BOOKING_DAYS && (
                            <span className="block text-xs">Need {MIN_BOOKING_DAYS - bookingInfo.diffDays} more days</span>
                        )}
                    </div>
                )}

                <Button
                    type="submit"
                    className="w-full h-12 text-lg font-semibold rounded-xl"
                    disabled={isLoading || isOffline || hasSubmittedSuccessfully || (bookingInfo !== null && !bookingInfo.isValid)}
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Processing...
                        </span>
                    ) : (
                        'Request to Book'
                    )}
                </Button>

                {/* Error/Success Messages */}
                {message && (
                    message.includes('success') ? renderSuccessMessage() : renderErrorBanner()
                )}

                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                    You won't be charged yet
                </p>
            </form>

            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>Monthly rent</span>
                    <span>${price}</span>
                </div>
                {bookingInfo && bookingInfo.diffDays > 0 && (
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Duration</span>
                        <span>{bookingInfo.diffDays} days</span>
                    </div>
                )}
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                    <span>Service fee</span>
                    <span>$0</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-3 text-zinc-900 dark:text-white">
                    <span>Total</span>
                    <span>${bookingInfo?.totalPrice || price}</span>
                </div>
            </div>
        </div>
    );
}

