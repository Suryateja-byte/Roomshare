import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getMyVerificationStatus } from '@/app/actions/verification';
import VerificationForm from './VerificationForm';
import { ShieldCheck, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default async function VerifyPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/verify');
    }

    const status = await getMyVerificationStatus();

    return (
        <div className="min-h-screen bg-zinc-50 py-12">
            <div className="max-w-2xl mx-auto px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-8 py-10 text-white">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                                <ShieldCheck className="w-8 h-8" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">ID Verification</h1>
                                <p className="text-zinc-300 mt-1">
                                    Build trust by verifying your identity
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                        {status.status === 'verified' && (
                            <div className="text-center py-8">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                                </div>
                                <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                                    You're Verified!
                                </h2>
                                <p className="text-zinc-600 mb-6">
                                    Your identity has been verified. You now have a verified badge on your profile.
                                </p>
                                <Link
                                    href="/profile"
                                    className="inline-flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors"
                                >
                                    View Your Profile
                                </Link>
                            </div>
                        )}

                        {status.status === 'pending' && (
                            <div className="text-center py-8">
                                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Clock className="w-10 h-10 text-amber-600" />
                                </div>
                                <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                                    Verification Pending
                                </h2>
                                <p className="text-zinc-600 mb-6">
                                    We're reviewing your documents. This usually takes 1-2 business days.
                                    We'll notify you once your verification is complete.
                                </p>
                                <div className="bg-zinc-50 rounded-xl p-4 inline-block">
                                    <p className="text-sm text-zinc-500">
                                        Request ID: <code className="text-zinc-700">{status.requestId}</code>
                                    </p>
                                </div>
                            </div>
                        )}

                        {status.status === 'rejected' && (
                            <div className="py-8">
                                <div className="text-center mb-8">
                                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <XCircle className="w-10 h-10 text-red-600" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                                        Verification Not Approved
                                    </h2>
                                    <p className="text-zinc-600 mb-4">
                                        Unfortunately, we couldn't verify your identity.
                                    </p>
                                    {status.reason && (
                                        <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-w-md mx-auto">
                                            <p className="text-sm text-red-700">
                                                <strong>Reason:</strong> {status.reason}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-zinc-100 pt-8">
                                    <h3 className="text-lg font-semibold text-zinc-900 mb-4 text-center">
                                        Try Again
                                    </h3>
                                    <VerificationForm />
                                </div>
                            </div>
                        )}

                        {status.status === 'not_started' && (
                            <div>
                                {/* Benefits */}
                                <div className="mb-8">
                                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                                        Why Get Verified?
                                    </h2>
                                    <div className="grid gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-zinc-900">Build Trust</p>
                                                <p className="text-sm text-zinc-500">
                                                    Verified users get 3x more responses from hosts
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-zinc-900">Stand Out</p>
                                                <p className="text-sm text-zinc-500">
                                                    Get a verification badge on your profile
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-zinc-900">Safer Community</p>
                                                <p className="text-sm text-zinc-500">
                                                    Help make RoomShare a trusted platform for everyone
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-zinc-100 pt-8">
                                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                                        Submit Your Documents
                                    </h2>
                                    <VerificationForm />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
